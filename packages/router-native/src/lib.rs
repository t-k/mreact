use serde::Deserialize;
use std::collections::{HashMap, HashSet};

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

#[derive(Debug, Deserialize)]
struct RequestPlaneManifest {
  #[serde(default, rename = "hasMiddleware")]
  has_middleware: bool,
  #[serde(default, rename = "prerenderedRoutes")]
  prerendered_routes: HashMap<String, RequestPlanePrerenderedRoute>,
  #[serde(default, rename = "publicAssets")]
  public_assets: Vec<RequestPlanePublicAsset>,
  routes: Vec<RequestPlaneRoute>,
  version: u32,
}

#[derive(Debug, Deserialize)]
struct RequestPlanePrerenderedRoute {
  status: u16,
}

#[derive(Debug, Deserialize)]
struct RequestPlanePublicAsset {
  path: String,
}

#[derive(Debug, Deserialize)]
struct RequestPlaneRoute {
  file: String,
  kind: String,
  path: String,
  segments: Vec<RouteSegment>,
}

#[cfg_attr(not(test), napi)]
#[cfg_attr(test, allow(dead_code))]
pub struct NativeRouteMatcher {
  core: RouteMatcherCore,
}

#[cfg_attr(not(test), napi)]
#[cfg_attr(test, allow(dead_code))]
pub struct RustLambdaRequestPlane {
  core: RequestPlaneCore,
}

#[cfg_attr(not(test), napi(object))]
#[derive(Debug, PartialEq)]
pub struct NativeMatch {
  pub index: u32,
  pub params: HashMap<String, String>,
}

#[cfg_attr(not(test), napi(object))]
#[derive(Debug, PartialEq)]
pub struct RequestPlaneDecision {
  pub action: String,
  pub path: Option<String>,
  pub route_index: Option<u32>,
  pub status: Option<u16>,
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
impl RustLambdaRequestPlane {
  #[cfg_attr(not(test), napi(constructor))]
  pub fn new(manifest_json: String) -> napi::Result<Self> {
    Ok(Self {
      core: RequestPlaneCore::new(&manifest_json).map_err(Error::from_reason)?,
    })
  }

  #[cfg_attr(not(test), napi)]
  pub fn decide(&self, method: String, pathname: String) -> napi::Result<RequestPlaneDecision> {
    self.core.decide(&method, &pathname).map_err(Error::from_reason)
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

struct RequestPlaneCore {
  has_middleware: bool,
  prerendered_routes: HashMap<String, RequestPlanePrerenderedRoute>,
  public_assets: HashSet<String>,
  route_files: Vec<String>,
  route_kinds: Vec<String>,
  route_matcher: RouteMatcherCore,
  route_paths: Vec<String>,
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

impl RequestPlaneCore {
  fn new(manifest_json: &str) -> Result<Self, String> {
    let manifest: RequestPlaneManifest = serde_json::from_str(manifest_json)
      .map_err(|error| format!("Invalid mreact rust request-plane manifest: {error}"))?;

    if manifest.version != 1 {
      return Err(format!(
        "Unsupported mreact rust request-plane manifest version: {}",
        manifest.version,
      ));
    }

    let route_matcher = RouteMatcherCore {
      routes: manifest
        .routes
        .iter()
        .enumerate()
        .map(|(index, route)| Route {
          index: index as u32,
          segments: route.segments.clone(),
        })
        .collect(),
    };
    let route_files = manifest
      .routes
      .iter()
      .map(|route| route.file.clone())
      .collect();
    let route_kinds = manifest
      .routes
      .iter()
      .map(|route| route.kind.clone())
      .collect();
    let route_paths = manifest
      .routes
      .iter()
      .map(|route| normalize_path(&route.path))
      .collect();
    let public_assets = manifest
      .public_assets
      .into_iter()
      .map(|asset| normalize_path(&asset.path))
      .collect();
    let prerendered_routes = manifest
      .prerendered_routes
      .into_iter()
      .map(|(path, route)| (normalize_path(&path), route))
      .collect();

    Ok(Self {
      has_middleware: manifest.has_middleware,
      prerendered_routes,
      public_assets,
      route_files,
      route_kinds,
      route_matcher,
      route_paths,
    })
  }

  fn decide(&self, method: &str, pathname: &str) -> Result<RequestPlaneDecision, String> {
    let method = method.to_ascii_uppercase();
    let normalized = normalize_path(pathname);
    let static_read = method == "GET" || method == "HEAD";

    if static_read && normalized.starts_with("/_mreact/client/") {
      return Ok(decision("serve-client-asset", Some(normalized), None, Some(200)));
    }

    if static_read && self.public_assets.contains(&normalized) {
      return Ok(decision("serve-public-asset", Some(normalized), None, Some(200)));
    }

    let matched = self.route_matcher.match_route(&normalized)?;
    let route_index = matched.as_ref().map(|matched| matched.index);

    if static_read {
      if let Some(prerendered) = self.prerendered_routes.get(&normalized) {
        return Ok(decision(
          "serve-prerendered",
          Some(normalized),
          route_index,
          Some(prerendered.status),
        ));
      }
    }

    let Some(matched) = matched else {
      return Ok(decision("fallback-js", Some(normalized), None, None));
    };

    let route_index = matched.index;
    let route_kind = self
      .route_kinds
      .get(route_index as usize)
      .map(String::as_str)
      .unwrap_or("server");
    let route_path = self
      .route_paths
      .get(route_index as usize)
      .cloned()
      .unwrap_or_else(|| normalized.clone());

    let _route_file = self.route_files.get(route_index as usize);

    if route_kind == "page" && !self.has_middleware {
      if method == "OPTIONS" {
        return Ok(decision("page-options", Some(route_path), Some(route_index), Some(204)));
      }

      if method != "GET" && method != "HEAD" {
        return Ok(decision(
          "method-not-allowed",
          Some(route_path),
          Some(route_index),
          Some(405),
        ));
      }
    }

    Ok(decision(
      "fallback-js",
      Some(route_path),
      Some(route_index),
      None,
    ))
  }
}

fn decision(
  action: &str,
  path: Option<String>,
  route_index: Option<u32>,
  status: Option<u16>,
) -> RequestPlaneDecision {
  RequestPlaneDecision {
    action: action.to_string(),
    path,
    route_index,
    status,
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

  let mut params: Option<HashMap<String, String>> = None;

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
        params
          .get_or_insert_with(HashMap::new)
          .insert(name.clone(), decode_uri_component(value)?);
      }
      RouteSegment::CatchAll { name } => {
        let decoded_parts = pathname_segments[index..]
          .iter()
          .map(|part| decode_uri_component(part))
          .collect::<Result<Vec<_>, String>>()?;
        params
          .get_or_insert_with(HashMap::new)
          .insert(name.clone(), decoded_parts.join("/"));
        break;
      }
    }
  }

  Ok(Some(params.unwrap_or_default()))
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

  #[test]
  fn request_plane_serves_rust_only_paths_before_js_fallback() {
    let plane = RequestPlaneCore::new(
      r#"{
        "version": 1,
        "hasMiddleware": false,
        "publicAssets": [
          {"path": "/favicon.ico", "file": "favicon.ico", "contentType": "image/vnd.microsoft.icon"}
        ],
        "prerenderedRoutes": {
          "/": {"status": 200, "headers": {"content-type": "text/html; charset=utf-8"}}
        },
        "routes": [
          {"kind":"page","path":"/","file":"page.tsx","segments":[]},
          {"kind":"page","path":"/dashboard","file":"dashboard/page.tsx","segments":[{"kind":"static","value":"dashboard"}]},
          {"kind":"server","path":"/api/time","file":"api/time/route.ts","segments":[{"kind":"static","value":"api"},{"kind":"static","value":"time"}]}
        ]
      }"#,
    )
    .unwrap();

    assert_eq!(
      plane.decide("GET", "/favicon.ico").unwrap(),
      RequestPlaneDecision {
        action: "serve-public-asset".to_string(),
        path: Some("/favicon.ico".to_string()),
        route_index: None,
        status: Some(200),
      },
    );
    assert_eq!(
      plane.decide("HEAD", "/").unwrap(),
      RequestPlaneDecision {
        action: "serve-prerendered".to_string(),
        path: Some("/".to_string()),
        route_index: Some(0),
        status: Some(200),
      },
    );
    assert_eq!(
      plane.decide("POST", "/dashboard").unwrap(),
      RequestPlaneDecision {
        action: "method-not-allowed".to_string(),
        path: Some("/dashboard".to_string()),
        route_index: Some(1),
        status: Some(405),
      },
    );
    assert_eq!(
      plane.decide("GET", "/dashboard").unwrap(),
      RequestPlaneDecision {
        action: "fallback-js".to_string(),
        path: Some("/dashboard".to_string()),
        route_index: Some(1),
        status: None,
      },
    );
    assert_eq!(
      plane.decide("GET", "/api/time").unwrap(),
      RequestPlaneDecision {
        action: "fallback-js".to_string(),
        path: Some("/api/time".to_string()),
        route_index: Some(2),
        status: None,
      },
    );
  }

  #[test]
  fn request_plane_keeps_page_method_gating_behind_middleware() {
    let plane = RequestPlaneCore::new(
      r#"{
        "version": 1,
        "hasMiddleware": true,
        "publicAssets": [],
        "prerenderedRoutes": {},
        "routes": [
          {"kind":"page","path":"/dashboard","file":"dashboard/page.tsx","segments":[{"kind":"static","value":"dashboard"}]}
        ]
      }"#,
    )
    .unwrap();

    assert_eq!(
      plane.decide("POST", "/dashboard").unwrap(),
      RequestPlaneDecision {
        action: "fallback-js".to_string(),
        path: Some("/dashboard".to_string()),
        route_index: Some(0),
        status: None,
      },
    );
  }
}
