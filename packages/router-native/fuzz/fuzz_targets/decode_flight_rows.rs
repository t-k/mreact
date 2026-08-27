#![no_main]

use libfuzzer_sys::fuzz_target;
use mreact_router_native::flight::decode_flight_rows;

fuzz_target!(|data: &[u8]| {
  let input = String::from_utf8_lossy(data);

  if let Ok(decoded) = decode_flight_rows(&input) {
    assert!(serde_json::from_str::<serde_json::Value>(&decoded).is_ok());
  }
});
