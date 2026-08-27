#![no_main]

use libfuzzer_sys::fuzz_target;
use mreact_router_native::flight::merge_flight_rows;
use serde_json::{json, Value};

fn bounded_text(data: &[u8]) -> String {
  String::from_utf8_lossy(&data[..data.len().min(64)])
    .chars()
    .map(|character| match character {
      '\r' | '\n' => ' ',
      other => other,
    })
    .collect()
}

fuzz_target!(|data: &[u8]| {
  let text = bounded_text(data.get(1..).unwrap_or_default());
  let previous = json!({
    "version": 1,
    "root": { "kind": "promise", "id": 1 },
    "clientReferences": [],
    "serverReferences": [],
  });
  let (rows, expected) = match data.first().copied().unwrap_or(0) % 3 {
    0 => (format!("1:T{:x},{}", text.len(), text), json!(text)),
    1 => {
      let error = json!({ "name": "FuzzError", "message": text });
      (
        format!("1:E{error}"),
        json!({ "kind": "error", "name": "FuzzError", "message": text }),
      )
    }
    _ => (
      format!("1:\"$2\"\n2:{}", serde_json::to_string(&text).unwrap()),
      json!(text),
    ),
  };
  let merged =
    merge_flight_rows(&previous.to_string(), &rows).expect("valid merge rows must resolve");
  let merged: Value = serde_json::from_str(&merged).expect("merged response must be JSON");
  assert_eq!(merged.get("root"), Some(&expected));
});
