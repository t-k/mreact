#![no_main]

use libfuzzer_sys::fuzz_target;
use mreact_router_native::flight::decode_flight_rows;
use serde::Deserialize;

fn parses_as_bounded_flight_json(value: &str) -> bool {
  let mut deserializer = serde_json::Deserializer::from_str(value);
  deserializer.disable_recursion_limit();
  serde_json::Value::deserialize(&mut deserializer).is_ok()
}

fuzz_target!(|data: &[u8]| {
  let input = String::from_utf8_lossy(data);

  if let Ok(decoded) = decode_flight_rows(&input) {
    assert!(parses_as_bounded_flight_json(&decoded));
  }

  let requested_depth = data
    .first()
    .zip(data.get(1))
    .map(|(high, low)| usize::from(u16::from_be_bytes([*high, *low])) % 400)
    .unwrap_or(0);
  let nested_rows = format!(
    "0:{}0{}",
    "[".repeat(requested_depth),
    "]".repeat(requested_depth)
  );
  let nested_result = decode_flight_rows(&nested_rows);

  // Keep this boundary synchronized with MAX_FLIGHT_DECODE_DEPTH in flight.rs.
  if requested_depth > 256 {
    assert!(nested_result.is_err());
  } else {
    let decoded = nested_result.unwrap();
    assert!(parses_as_bounded_flight_json(&decoded));
  }
});
