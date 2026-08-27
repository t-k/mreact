#![cfg_attr(not(feature = "napi-bindings"), allow(dead_code))]

use serde::Deserialize;
use std::collections::HashMap;

#[cfg(all(not(test), feature = "napi-bindings"))]
use napi::Error;
#[cfg(all(not(test), feature = "napi-bindings"))]
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

#[cfg_attr(all(not(test), feature = "napi-bindings"), napi)]
#[cfg_attr(test, allow(dead_code))]
pub struct NativeRouteMatcher {
  core: RouteMatcherCore,
}

#[cfg_attr(all(not(test), feature = "napi-bindings"), napi(object))]
#[derive(Debug, PartialEq)]
pub struct NativeMatch {
  pub index: u32,
  pub params: HashMap<String, String>,
  pub catch_all_params: HashMap<String, Vec<String>>,
}

#[derive(Debug)]
struct MatchParams {
  params: HashMap<String, String>,
  catch_all_params: HashMap<String, Vec<String>>,
}

#[cfg(all(not(test), feature = "napi-bindings"))]
#[napi]
impl NativeRouteMatcher {
  #[cfg_attr(all(not(test), feature = "napi-bindings"), napi(constructor))]
  pub fn new(routes_json: String) -> napi::Result<Self> {
    Ok(Self {
      core: RouteMatcherCore::new(&routes_json).map_err(Error::from_reason)?,
    })
  }

  #[cfg_attr(all(not(test), feature = "napi-bindings"), napi)]
  pub fn match_route(&self, pathname: String) -> napi::Result<Option<NativeMatch>> {
    self.core.match_route(&pathname).map_err(Error::from_reason)
  }
}

#[cfg(all(not(test), feature = "napi-bindings"))]
#[napi]
pub fn escape_html_batch(values: Vec<String>) -> Vec<String> {
  values.into_iter().map(|value| escape_html(&value)).collect()
}

#[cfg(all(not(test), feature = "napi-bindings"))]
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
          params: params.params,
          catch_all_params: params.catch_all_params,
        }));
      }
    }

    Ok(None)
  }
}

fn match_segments(
  route_segments: &[RouteSegment],
  pathname_segments: &[&str],
) -> Result<Option<MatchParams>, String> {
  let catch_all_index = route_segments
    .iter()
    .position(|segment| matches!(segment, RouteSegment::CatchAll { .. }));

  if catch_all_index.is_none() && route_segments.len() != pathname_segments.len() {
    return Ok(None);
  }

  let mut params = MatchParams {
    params: HashMap::new(),
    catch_all_params: HashMap::new(),
  };

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
        let Ok(decoded) = decode_uri_component(value) else {
          return Ok(None);
        };
        params.params.insert(name.clone(), decoded);
      }
      RouteSegment::CatchAll { name } => {
        let suffix_segments = &route_segments[index + 1..];
        let Some(catch_all_end) = pathname_segments.len().checked_sub(suffix_segments.len()) else {
          return Ok(None);
        };

        if catch_all_end <= index {
          return Ok(None);
        }

        let decoded_parts = pathname_segments[index..catch_all_end]
          .iter()
          .map(|part| decode_uri_component(part))
          .collect::<Result<Vec<_>, String>>();
        let Ok(decoded_parts) = decoded_parts else {
          return Ok(None);
        };
        params.catch_all_params.insert(name.clone(), decoded_parts);

        for (suffix_index, suffix_segment) in suffix_segments.iter().enumerate() {
          let Some(value) = pathname_segments.get(catch_all_end + suffix_index) else {
            return Ok(None);
          };

          match suffix_segment {
            RouteSegment::Static { value: expected } => {
              if expected != value {
                return Ok(None);
              }
            }
            RouteSegment::Dynamic { name } => {
              let Ok(decoded) = decode_uri_component(value) else {
                return Ok(None);
              };
              params.params.insert(name.clone(), decoded);
            }
            RouteSegment::CatchAll { .. } => return Ok(None),
          }
        }

        break;
      }
    }
  }

  Ok(Some(params))
}

fn normalize_path(pathname: &str) -> String {
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
  escape_with_quotes(value)
}

fn escape_attribute(value: &str) -> String {
  escape_with_quotes(value)
}

fn escape_with_quotes(value: &str) -> String {
  let mut output: Option<String> = None;

  for (index, character) in value.char_indices() {
    let replacement = match character {
      '&' => "&amp;",
      '<' => "&lt;",
      '>' => "&gt;",
      '"' => "&quot;",
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
        catch_all_params: HashMap::new(),
      },
    );
    assert_eq!(
      matcher.match_route("/docs/intro").unwrap().unwrap(),
      NativeMatch {
        index: 1,
        params: HashMap::from([("id".to_string(), "intro".to_string())]),
        catch_all_params: HashMap::new(),
      },
    );
    assert_eq!(
      matcher
        .match_route("/docs/guides/install")
        .unwrap()
        .unwrap(),
      NativeMatch {
        index: 2,
        params: HashMap::new(),
        catch_all_params: HashMap::from([(
          "slug".to_string(),
          vec!["guides".to_string(), "install".to_string()],
        )]),
      },
    );
  }

  #[test]
  fn preserves_catch_all_segment_boundaries_for_encoded_slashes() {
    let matcher = RouteMatcherCore::new(
      r#"[
        {"index":0,"segments":[{"kind":"static","value":"docs"},{"kind":"catch-all","name":"slug"}]}
      ]"#,
    )
    .unwrap();

    assert_eq!(
      matcher.match_route("/docs/a%2Fb").unwrap().unwrap(),
      NativeMatch {
        index: 0,
        params: HashMap::new(),
        catch_all_params: HashMap::from([("slug".to_string(), vec!["a/b".to_string()])]),
      },
    );
    assert_eq!(
      matcher.match_route("/docs/a%252Fb").unwrap().unwrap(),
      NativeMatch {
        index: 0,
        params: HashMap::new(),
        catch_all_params: HashMap::from([("slug".to_string(), vec!["a%2Fb".to_string()])]),
      },
    );
    assert_eq!(
      matcher.match_route("/docs/a/b").unwrap().unwrap(),
      NativeMatch {
        index: 0,
        params: HashMap::new(),
        catch_all_params: HashMap::from([(
          "slug".to_string(),
          vec!["a".to_string(), "b".to_string()],
        )]),
      },
    );
  }

  #[test]
  fn returns_none_for_malformed_percent_escapes() {
    let matcher = RouteMatcherCore::new(
      r#"[
        {"index":0,"segments":[{"kind":"static","value":"docs"},{"kind":"catch-all","name":"slug"}]}
      ]"#,
    )
    .unwrap();

    assert_eq!(matcher.match_route("/docs/%ZZ").unwrap(), None);
    assert_eq!(matcher.match_route("/docs/%E0").unwrap(), None);
    assert_eq!(matcher.match_route("/docs/%").unwrap(), None);
    assert_eq!(matcher.match_route("/docs/%C0%AF").unwrap(), None);
  }

  #[test]
  fn matches_catch_all_routes_with_static_suffix() {
    let matcher = RouteMatcherCore::new(
      r#"[
        {"index":0,"segments":[{"kind":"catch-all","name":"slug"},{"kind":"static","value":"opengraph-image"}]},
        {"index":1,"segments":[{"kind":"catch-all","name":"slug"}]}
      ]"#,
    )
    .unwrap();

    assert_eq!(
      matcher.match_route("/hello").unwrap().unwrap(),
      NativeMatch {
        index: 1,
        params: HashMap::new(),
        catch_all_params: HashMap::from([("slug".to_string(), vec!["hello".to_string()])]),
      },
    );
    assert_eq!(
      matcher.match_route("/hello/opengraph-image").unwrap().unwrap(),
      NativeMatch {
        index: 0,
        params: HashMap::new(),
        catch_all_params: HashMap::from([("slug".to_string(), vec!["hello".to_string()])]),
      },
    );
  }

  #[test]
  fn matches_catch_all_routes_with_multiple_prefix_and_suffix_segments() {
    let matcher = RouteMatcherCore::new(
      r#"[
        {"index":0,"segments":[{"kind":"static","value":"api"},{"kind":"static","value":"v1"},{"kind":"catch-all","name":"slug"},{"kind":"static","value":"edit"},{"kind":"dynamic","name":"id"}]}
      ]"#,
    )
    .unwrap();

    assert_eq!(matcher.match_route("/api/v1/a/edit").unwrap(), None);
    assert_eq!(
      matcher.match_route("/api/v1/a/edit/42").unwrap().unwrap(),
      NativeMatch {
        index: 0,
        params: HashMap::from([("id".to_string(), "42".to_string())]),
        catch_all_params: HashMap::from([("slug".to_string(), vec!["a".to_string()])]),
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
        catch_all_params: HashMap::new(),
      },
    );
    assert_eq!(
      matcher.match_route("/users/%c3%a9").unwrap().unwrap(),
      NativeMatch {
        index: 0,
        params: HashMap::from([("id".to_string(), "é".to_string())]),
        catch_all_params: HashMap::new(),
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
