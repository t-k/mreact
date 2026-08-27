#![no_main]

use libfuzzer_sys::fuzz_target;
use mreact_router_native::flight::{decode_flight_rows, encode_flight_response};
use serde_json::{json, Value};

fn bounded_text(data: &[u8]) -> String {
  String::from_utf8_lossy(&data[..data.len().min(64)]).into_owned()
}

fn model(data: &[u8]) -> Value {
  let discriminator = data.first().copied().unwrap_or(0) % 9;
  let text = bounded_text(data.get(1..).unwrap_or_default());

  match discriminator {
    0 => Value::Null,
    1 => json!(data.get(1).copied().unwrap_or(0) % 2 == 0),
    2 => json!(i64::from(data.get(1).copied().unwrap_or(0)) - 128),
    3 => json!(text),
    4 => json!([text, data.len(), Value::Null]),
    5 => json!({ "text": text, "length": data.len() }),
    6 => json!({ "kind": "map", "entries": [["key", text]] }),
    7 => json!({ "kind": "set", "values": [text, data.len()] }),
    _ => json!({
      "kind": "typed-array",
      "arrayType": "Uint8Array",
      "bytes": data.iter().take(64).copied().collect::<Vec<_>>(),
    }),
  }
}

fuzz_target!(|data: &[u8]| {
  let root = model(data);
  let response = json!({
    "version": 1,
    "root": root,
    "clientReferences": [],
    "serverReferences": [],
  });
  let rows = encode_flight_response(&response.to_string()).expect("supported model must encode");
  let decoded = decode_flight_rows(&rows).expect("encoded rows must decode");
  let decoded: Value = serde_json::from_str(&decoded).expect("decoded response must be JSON");
  assert_eq!(decoded.get("root"), response.get("root"));
});
