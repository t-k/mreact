#![no_main]

use libfuzzer_sys::fuzz_target;
use mreact_router_native::flight::decode_base64_bytes;

fuzz_target!(|data: &[u8]| {
  let input = String::from_utf8_lossy(data);
  let _ = decode_base64_bytes(&input);
});
