use serde::Deserialize;
use std::collections::HashMap;

#[cfg(not(test))]
use napi::Error;
#[cfg(not(test))]
use napi_derive::napi;

pub mod flight;

#[derive(Debug, Deserialize)]
struct RouteInput {
  index: u32,
  segments: Vec<RouteSegment>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind")]
enum RouteSegment {
  #[serde(rename = "static")]
  Static { value: String },
  #[serde(rename = "dynamic")]
  Dynamic { name: String },
  #[serde(rename = "catch-all")]
  CatchAll { name: String },
}

#[derive(Debug)]
struct Route {
  index: u32,
  segments: Vec<RouteSegment>,
}

#[cfg_attr(not(test), napi)]
#[cfg_attr(test, allow(dead_code))]
pub struct NativeRouteMatcher {
  core: RouteMatcherCore,
}

#[cfg_attr(not(test), napi(object))]
#[derive(Debug, PartialEq)]
pub struct NativeMatch {
  pub index: u32,
  pub params: HashMap<String, String>,
}

#[cfg(not(test))]
#[napi]
impl NativeRouteMatcher {
  #[cfg_attr(not(test), napi(constructor))]
  pub fn new(routes_json: String) -> napi::Result<Self> {
    Ok(Self {
      core: RouteMatcherCore::new(&routes_json).map_err(Error::from_reason)?,
    })
  }

  #[cfg_attr(not(test), napi)]
  pub fn match_route(&self, pathname: String) -> napi::Result<Option<NativeMatch>> {
    self.core.match_route(&pathname).map_err(Error::from_reason)
  }
}

#[cfg(not(test))]
#[napi]
pub fn escape_html_batch(values: Vec<String>) -> Vec<String> {
  values.into_iter().map(|value| escape_html(&value)).collect()
}

#[cfg(not(test))]
#[napi]
pub fn escape_attribute_batch(values: Vec<String>) -> Vec<String> {
  values.into_iter().map(|value| escape_attribute(&value)).collect()
}

struct RouteMatcherCore {
  routes: Vec<Route>,
}

impl RouteMatcherCore {
  fn new(routes_json: &str) -> Result<Self, String> {
    let inputs: Vec<RouteInput> = serde_json::from_str(routes_json)
      .map_err(|error| format!("Invalid mreact route matcher input: {error}"))?;
    let routes = inputs
      .into_iter()
      .map(|input| Route {
        index: input.index,
        segments: input.segments,
      })
      .collect();

    Ok(Self { routes })
  }

  fn match_route(&self, pathname: &str) -> Result<Option<NativeMatch>, String> {
    let normalized = normalize_path(pathname);
    let pathname_segments = path_segments(&normalized);

    for route in &self.routes {
      if let Some(params) = match_segments(&route.segments, &pathname_segments)? {
        return Ok(Some(NativeMatch {
          index: route.index,
          params,
        }));
      }
    }

    Ok(None)
  }
}

fn match_segments(
  route_segments: &[RouteSegment],
  pathname_segments: &[&str],
) -> Result<Option<HashMap<String, String>>, String> {
  let catch_all_index = route_segments
    .iter()
    .position(|segment| matches!(segment, RouteSegment::CatchAll { .. }));

  if catch_all_index.is_none() && route_segments.len() != pathname_segments.len() {
    return Ok(None);
  }

  if let Some(index) = catch_all_index {
    if pathname_segments.len() < index + 1 {
      return Ok(None);
    }
  }

  let mut params = HashMap::new();

  for (index, segment) in route_segments.iter().enumerate() {
    let Some(value) = pathname_segments.get(index) else {
      return Ok(None);
    };

    match segment {
      RouteSegment::Static { value: expected } => {
        if expected != value {
          return Ok(None);
        }
      }
      RouteSegment::Dynamic { name } => {
        params.insert(name.clone(), decode_uri_component(value)?);
      }
      RouteSegment::CatchAll { name } => {
        let decoded_parts = pathname_segments[index..]
          .iter()
          .map(|part| decode_uri_component(part))
          .collect::<Result<Vec<_>, String>>()?;
        params.insert(name.clone(), decoded_parts.join("/"));
        break;
      }
    }
  }

  Ok(Some(params))
}

fn normalize_path(pathname: &str) -> String {
  if pathname.len() <= 1 {
    return if pathname.is_empty() { "/".to_string() } else { pathname.to_string() };
  }

  let trimmed = pathname.trim_end_matches('/');

  if trimmed.is_empty() {
    "/".to_string()
  } else {
    trimmed.to_string()
  }
}

fn path_segments(pathname: &str) -> Vec<&str> {
  if pathname == "/" {
    Vec::new()
  } else {
    pathname.trim_start_matches('/').split('/').collect()
  }
}

fn decode_uri_component(value: &str) -> Result<String, String> {
  let bytes = value.as_bytes();
  let mut output = Vec::with_capacity(bytes.len());
  let mut index = 0;

  while index < bytes.len() {
    if bytes[index] != b'%' {
      output.push(bytes[index]);
      index += 1;
      continue;
    }

    if index + 2 >= bytes.len() {
      return Err(format!("Invalid percent escape in route segment: {value}"));
    }

    let high = hex_value(bytes[index + 1])
      .ok_or_else(|| format!("Invalid percent escape in route segment: {value}"))?;
    let low = hex_value(bytes[index + 2])
      .ok_or_else(|| format!("Invalid percent escape in route segment: {value}"))?;
    output.push((high << 4) | low);
    index += 3;
  }

  String::from_utf8(output)
    .map_err(|error| format!("Invalid UTF-8 route segment: {error}"))
}

fn hex_value(byte: u8) -> Option<u8> {
  match byte {
    b'0'..=b'9' => Some(byte - b'0'),
    b'a'..=b'f' => Some(byte - b'a' + 10),
    b'A'..=b'F' => Some(byte - b'A' + 10),
    _ => None,
  }
}

fn escape_html(value: &str) -> String {
  escape_with_quotes(value, true)
}

fn escape_attribute(value: &str) -> String {
  escape_with_quotes(value, true)
}

fn escape_with_quotes(value: &str, escape_quotes: bool) -> String {
  let mut output: Option<String> = None;

  for (index, character) in value.char_indices() {
    let replacement = match character {
      '&' => "&amp;",
      '<' => "&lt;",
      '>' => "&gt;",
      '"' if escape_quotes => "&quot;",
      _ => {
        if let Some(escaped) = output.as_mut() {
          escaped.push(character);
        }
        continue;
      }
    };

    let escaped = output.get_or_insert_with(|| {
      let mut initial = String::with_capacity(value.len() + 8);
      initial.push_str(&value[..index]);
      initial
    });
    escaped.push_str(replacement);
  }

  output.unwrap_or_else(|| value.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn matches_dynamic_and_catch_all_routes() {
    let matcher = RouteMatcherCore::new(
      r#"[
        {"index":0,"segments":[{"kind":"static","value":"docs"},{"kind":"static","value":"new"}]},
        {"index":1,"segments":[{"kind":"static","value":"docs"},{"kind":"dynamic","name":"id"}]},
        {"index":2,"segments":[{"kind":"static","value":"docs"},{"kind":"catch-all","name":"slug"}]}
      ]"#,
    )
    .unwrap();

    assert_eq!(
      matcher.match_route("/docs/new").unwrap().unwrap(),
      NativeMatch {
        index: 0,
        params: HashMap::new(),
      },
    );
    assert_eq!(
      matcher.match_route("/docs/intro").unwrap().unwrap(),
      NativeMatch {
        index: 1,
        params: HashMap::from([("id".to_string(), "intro".to_string())]),
      },
    );
    assert_eq!(
      matcher
        .match_route("/docs/guides/install")
        .unwrap()
        .unwrap(),
      NativeMatch {
        index: 2,
        params: HashMap::from([("slug".to_string(), "guides/install".to_string())]),
      },
    );
  }

  #[test]
  fn decodes_percent_encoded_params() {
    let matcher = RouteMatcherCore::new(
      r#"[{"index":0,"segments":[{"kind":"static","value":"users"},{"kind":"dynamic","name":"id"}]}]"#
    )
    .unwrap();

    assert_eq!(
      matcher.match_route("/users/Ada%20Lovelace").unwrap().unwrap(),
      NativeMatch {
        index: 0,
        params: HashMap::from([("id".to_string(), "Ada Lovelace".to_string())]),
      },
    );
  }

  #[test]
  fn escapes_html_and_attributes() {
    assert_eq!(
      escape_html(r#"<span title="a&b">"#),
      "&lt;span title=&quot;a&amp;b&quot;&gt;",
    );
    assert_eq!(
      escape_attribute(r#"a"b&<c>"#),
      "a&quot;b&amp;&lt;c&gt;",
    );
    assert_eq!(escape_html("plain"), "plain");
  }
}
