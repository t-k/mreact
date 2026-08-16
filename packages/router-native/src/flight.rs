// React Flight protocol helpers (issue 081).
//
// All functions in this module are pure — no IO, no global state. They
// mirror the corresponding TypeScript helpers in
// `packages/server/src/flight.ts` exactly. Behavior parity is pinned by
// the conformance corpus at
// `packages/server/test/flight-roundtrip-corpus.test.ts`.
//
// The encoder/decoder are recursive walkers guarded by an explicit
// depth cap (`MAX_FLIGHT_DECODE_DEPTH`, matching the JS constant
// introduced for issue 079). Rust's default 8 MB main-thread stack is
// large enough that the cap fires long before the platform stack does.

use serde_json::{json, Value};

#[cfg(not(test))]
use napi::Error;
#[cfg(not(test))]
use napi_derive::napi;

// Issue 079 parity: hard cap on Flight tree depth to prevent
// stack-exhaustion DoS from a hostile payload.
const MAX_FLIGHT_DECODE_DEPTH: usize = 256;

/// Decode a (possibly URL-safe, possibly unpadded) base64 string into
/// its raw bytes. Mirrors `decodeBase64Bytes` at flight.ts:1129.
///
/// Tolerates the URL-safe alphabet (`-` and `_` map to `+` and `/`) and
/// pads the input with `=` to a multiple of 4 before decoding. Returns
/// an error string describing the bad character on malformed input —
/// this is converted to a `napi::Error` at the FFI boundary.
pub fn decode_base64_bytes(value: &str) -> Result<Vec<u8>, String> {
  let bytes = value.as_bytes();
  let groups = bytes.len().div_ceil(4);
  let mut output = Vec::with_capacity(groups * 3);
  let mut group = [0u8; 4];
  let mut group_len = 0usize;
  let mut padding = 0usize;

  for &byte in bytes {
    if padding > 0 {
      // After `=` we must only see more `=` (or whitespace, which we
      // do not accept in this strict decoder).
      if byte == b'=' {
        padding += 1;
        continue;
      }
      return Err(format!("Invalid base64 character after padding: {byte:#x}"));
    }
    if byte == b'=' {
      padding = 1;
      continue;
    }
    let decoded = decode_base64_char(byte)?;
    group[group_len] = decoded;
    group_len += 1;
    if group_len == 4 {
      output.push((group[0] << 2) | (group[1] >> 4));
      output.push((group[1] << 4) | (group[2] >> 2));
      output.push((group[2] << 6) | group[3]);
      group_len = 0;
    }
  }

  // Implicit padding: pad the trailing partial group with zero bits.
  if group_len == 2 {
    output.push((group[0] << 2) | (group[1] >> 4));
  } else if group_len == 3 {
    output.push((group[0] << 2) | (group[1] >> 4));
    output.push((group[1] << 4) | (group[2] >> 2));
  } else if group_len == 1 {
    return Err("Invalid base64 input: trailing single character".to_string());
  }

  Ok(output)
}

fn decode_base64_char(byte: u8) -> Result<u8, String> {
  match byte {
    b'A'..=b'Z' => Ok(byte - b'A'),
    b'a'..=b'z' => Ok(byte - b'a' + 26),
    b'0'..=b'9' => Ok(byte - b'0' + 52),
    // Standard + URL-safe alphabets fold together:
    b'+' | b'-' => Ok(62),
    b'/' | b'_' => Ok(63),
    other => Err(format!("Invalid base64 character: {other:#x}")),
  }
}

fn encode_base64_bytes(bytes: &[u8]) -> String {
  const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
  for chunk in bytes.chunks(3) {
    let first = chunk[0];
    let second = chunk.get(1).copied().unwrap_or(0);
    let third = chunk.get(2).copied().unwrap_or(0);
    let block = ((first as u32) << 16) | ((second as u32) << 8) | third as u32;
    output.push(ALPHABET[((block >> 18) & 63) as usize] as char);
    output.push(ALPHABET[((block >> 12) & 63) as usize] as char);
    output.push(if chunk.len() > 1 {
      ALPHABET[((block >> 6) & 63) as usize] as char
    } else {
      '='
    });
    output.push(if chunk.len() > 2 {
      ALPHABET[(block & 63) as usize] as char
    } else {
      '='
    });
  }
  output
}

#[cfg(not(test))]
#[napi(js_name = "decodeFlightBase64")]
pub fn napi_decode_flight_base64(value: String) -> napi::Result<Vec<u8>> {
  decode_base64_bytes(&value).map_err(Error::from_reason)
}

// ---------------------------------------------------------------------
// Encoder
// ---------------------------------------------------------------------

struct EncodeState {
  client_wire_ids: std::collections::HashMap<u64, u64>,
  server_wire_ids: std::collections::HashMap<u64, u64>,
  // The JS encoder shares one Vec for the final row list and the
  // outline buffer (`state.outlineRows = rows`). We do the same so
  // outline rows produced while encoding a child value land in front
  // of the parent row in iteration order, which matters for the JS
  // decoder's single-pass cross-reference resolution.
  rows: Vec<String>,
  next_wire_id: u64,
}

/// Encode a serialized `FlightResponse` (the JSON shape JS passes us)
/// to the React Flight wire row format. Mirrors `toReactFlightRows`
/// at flight.ts:486 + `encodeReactFlightModel` at flight.ts:783.
pub fn encode_flight_response(response_json: &str) -> Result<String, String> {
  let response = parse_json_without_recursion_limit(response_json)
    .map_err(|e| format!("Invalid Flight response JSON: {e}"))?;
  let root = response
    .get("root")
    .ok_or_else(|| "Flight response missing root".to_string())?
    .clone();
  let client_refs = response
    .get("clientReferences")
    .and_then(|v| v.as_array())
    .cloned()
    .unwrap_or_default();
  let server_refs = response
    .get("serverReferences")
    .and_then(|v| v.as_array())
    .cloned()
    .unwrap_or_default();

  let mut state = EncodeState {
    client_wire_ids: std::collections::HashMap::new(),
    server_wire_ids: std::collections::HashMap::new(),
    rows: Vec::new(),
    next_wire_id: 1,
  };

  for reference in &client_refs {
    let id = reference.get("id").and_then(Value::as_u64).unwrap_or(0);
    let module_id = reference
      .get("moduleId")
      .and_then(Value::as_str)
      .unwrap_or("");
    let export_name = reference
      .get("exportName")
      .and_then(Value::as_str)
      .unwrap_or("default");
    let chunks = reference
      .get("chunks")
      .and_then(Value::as_array)
      .cloned()
      .unwrap_or_default();
    let wire_id = state.next_wire_id;
    state.next_wire_id += 1;
    state.client_wire_ids.insert(id, wire_id);
    let payload = json!([module_id, chunks, export_name]);
    state.rows.push(format!(
      "{}:I{}",
      format_flight_id(wire_id),
      serde_json::to_string(&payload).expect("payload is serializable")
    ));
  }

  for reference in &server_refs {
    let id = reference.get("id").and_then(Value::as_u64).unwrap_or(0);
    let module_id = reference
      .get("moduleId")
      .and_then(Value::as_str)
      .unwrap_or("");
    let export_name = reference
      .get("exportName")
      .and_then(Value::as_str)
      .unwrap_or("default");
    let bound = reference.get("bound").cloned();
    let wire_id = state.next_wire_id;
    state.next_wire_id += 1;
    state.server_wire_ids.insert(id, wire_id);

    let bound_encoded = match bound {
      Some(Value::Array(items)) => {
        let encoded: Result<Vec<Value>, String> = items
          .into_iter()
          .map(|item| encode_model(&item, &mut state, 0))
          .collect();
        Value::Array(encoded?)
      }
      _ => Value::Null,
    };

    let action_key = if export_name == "default" {
      module_id.to_string()
    } else {
      format!("{module_id}#{export_name}")
    };

    let payload = json!({
      "id": action_key,
      "bound": bound_encoded,
      "name": export_name,
    });
    state.rows.push(format!(
      "{}:F{}",
      format_flight_id(wire_id),
      serde_json::to_string(&payload).expect("payload is serializable")
    ));
  }

  let is_error_root = root
    .get("kind")
    .and_then(Value::as_str)
    .map(|k| k == "error")
    .unwrap_or(false);

  if is_error_root {
    let error_payload = encode_error_model(&root);
    state.rows.push(format!(
      "0:E{}",
      serde_json::to_string(&error_payload).expect("error payload is serializable")
    ));
  } else {
    let encoded = encode_model(&root, &mut state, 0)?;
    state.rows.push(format!(
      "0:{}",
      serde_json::to_string(&encoded).expect("model is serializable")
    ));
  }

  Ok(state.rows.join("\n"))
}

fn encode_model(
  model: &Value,
  state: &mut EncodeState,
  depth: usize,
) -> Result<Value, String> {
  if depth > MAX_FLIGHT_DECODE_DEPTH {
    return Err("MR_FLIGHT_TOO_DEEP".to_string());
  }

  match model {
    Value::Null => Ok(Value::Null),
    Value::Bool(_) | Value::Number(_) => Ok(model.clone()),
    Value::String(s) => {
      // `$`-prefixed strings get doubled per flight.ts:792.
      if s.starts_with('$') {
        Ok(Value::String(format!("${s}")))
      } else {
        Ok(model.clone())
      }
    }
    Value::Array(items) => {
      let encoded: Result<Vec<Value>, String> = items
        .iter()
        .map(|item| encode_model(item, state, depth + 1))
        .collect();
      Ok(Value::Array(encoded?))
    }
    Value::Object(map) => {
      let kind = map.get("kind").and_then(Value::as_str);
      match kind {
        Some("undefined") => Ok(Value::String("$u".to_string())),
        Some("date") => Ok(Value::String(format!(
          "$D{}",
          map.get("value").and_then(Value::as_str).unwrap_or("")
        ))),
        Some("bigint") => Ok(Value::String(format!(
          "$n{}",
          map.get("value").and_then(Value::as_str).unwrap_or("")
        ))),
        Some("number") => {
          let v = map.get("value").and_then(Value::as_str).unwrap_or("");
          match v {
            "Infinity" => Ok(Value::String("$I".to_string())),
            "NaN" => Ok(Value::String("$N".to_string())),
            other => Ok(Value::String(format!("${other}"))),
          }
        }
        Some("symbol") => Ok(Value::String(format!(
          "$S{}",
          map.get("name").and_then(Value::as_str).unwrap_or("")
        ))),
        Some("map") => {
          let entries = map
            .get("entries")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
          let encoded_entries: Result<Vec<Value>, String> = entries
            .into_iter()
            .map(|entry| {
              let pair = entry.as_array().cloned().unwrap_or_default();
              let k = pair.first().cloned().unwrap_or(Value::Null);
              let v = pair.get(1).cloned().unwrap_or(Value::Null);
              Ok(Value::Array(vec![
                encode_model(&k, state, depth + 1)?,
                encode_model(&v, state, depth + 1)?,
              ]))
            })
            .collect();
          let id = allocate_outline_row(state, Value::Array(encoded_entries?));
          Ok(Value::String(format!("$Q{}", format_flight_id(id))))
        }
        Some("set") => {
          let values = map
            .get("values")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
          let encoded: Result<Vec<Value>, String> = values
            .into_iter()
            .map(|v| encode_model(&v, state, depth + 1))
            .collect();
          let id = allocate_outline_row(state, Value::Array(encoded?));
          Ok(Value::String(format!("$W{}", format_flight_id(id))))
        }
        Some("form-data") => {
          let entries = map
            .get("entries")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
          let encoded_entries: Result<Vec<Value>, String> = entries
            .into_iter()
            .map(|entry| {
              let pair = entry.as_array().cloned().unwrap_or_default();
              let k = pair.first().cloned().unwrap_or(Value::Null);
              let v = pair.get(1).cloned().unwrap_or(Value::Null);
              Ok(Value::Array(vec![k, encode_model(&v, state, depth + 1)?]))
            })
            .collect();
          let id = allocate_outline_row(state, Value::Array(encoded_entries?));
          Ok(Value::String(format!("$K{}", format_flight_id(id))))
        }
        Some("iterable") => {
          let values = map
            .get("values")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
          let encoded: Result<Vec<Value>, String> = values
            .into_iter()
            .map(|v| encode_model(&v, state, depth + 1))
            .collect();
          let id = allocate_outline_row(state, Value::Array(encoded?));
          Ok(Value::String(format!("$i{}", format_flight_id(id))))
        }
        Some("error") => {
          let id = state.next_wire_id;
          state.next_wire_id += 1;
          let payload = encode_error_model(model);
          state.rows.push(format!(
            "{}:E{}",
            format_flight_id(id),
            serde_json::to_string(&payload).expect("error payload is serializable")
          ));
          Ok(Value::String(format!("$Z{}", format_flight_id(id))))
        }
        Some("promise") => {
          let id = map.get("id").and_then(Value::as_u64).unwrap_or(0);
          Ok(Value::String(format!("$@{}", format_flight_id(id))))
        }
        Some("server-reference") => {
          let id = map.get("id").and_then(Value::as_u64).unwrap_or(0);
          let wire = state.server_wire_ids.get(&id).copied().unwrap_or(id);
          Ok(Value::String(format!("$F{}", format_flight_id(wire))))
        }
        Some("client-reference") => {
          let id = map.get("id").and_then(Value::as_u64).unwrap_or(0);
          let wire = state.client_wire_ids.get(&id).copied().unwrap_or(id);
          Ok(Value::String(format!("$L{}", format_flight_id(wire))))
        }
        Some("element") => {
          let elem_type = map.get("type").cloned().unwrap_or(Value::Null);
          let key = map.get("key").cloned().unwrap_or(Value::Null);
          let props = map
            .get("props")
            .cloned()
            .unwrap_or_else(|| Value::Object(serde_json::Map::new()));
          let encoded_type = encode_element_type(&elem_type, &state.client_wire_ids);
          let encoded_props = encode_props(&props, state, depth + 1)?;
          Ok(json!(["$", encoded_type, key, encoded_props]))
        }
        Some("array-buffer") | Some("typed-array") | Some("data-view") => {
          encode_binary_model(map, state)
        }
        Some(_) => {
          // Unknown `kind` — pass through unchanged (the JS encoder
          // does the same via the trailing `return model`).
          Ok(model.clone())
        }
        None => {
          // Plain object — encode each value.
          encode_props(model, state, depth + 1)
        }
      }
    }
  }
}

fn encode_binary_model(
  model: &serde_json::Map<String, Value>,
  state: &mut EncodeState,
) -> Result<Value, String> {
  let kind = model.get("kind").and_then(Value::as_str).unwrap_or("");
  let tag = match kind {
    "array-buffer" => "A",
    "data-view" => "V",
    "typed-array" => match model.get("arrayType").and_then(Value::as_str).unwrap_or("") {
      "Int8Array" => "O",
      "Uint8Array" => "o",
      "Uint8ClampedArray" => "U",
      "Int16Array" => "S",
      "Uint16Array" => "s",
      "Int32Array" => "L",
      "Uint32Array" => "l",
      "Float32Array" => "G",
      "Float64Array" => "g",
      "BigInt64Array" => "M",
      "BigUint64Array" => "m",
      other => return Err(format!("Unsupported Flight typed array: {other}.")),
    },
    _ => return Err(format!("Unsupported Flight binary model: {kind}.")),
  };
  let byte_values = model
    .get("bytes")
    .and_then(Value::as_array)
    .ok_or_else(|| "Invalid Flight binary bytes.".to_string())?;
  let mut bytes = Vec::with_capacity(byte_values.len());
  for value in byte_values {
    let byte = value
      .as_u64()
      .filter(|value| *value <= u8::MAX as u64)
      .ok_or_else(|| "Invalid Flight binary byte.".to_string())?;
    bytes.push(byte as u8);
  }
  let id = state.next_wire_id;
  state.next_wire_id += 1;
  state.rows.push(format!(
    "{}:{tag}{},{}",
    format_flight_id(id),
    format_flight_id(bytes.len() as u64),
    encode_base64_bytes(&bytes),
  ));
  Ok(Value::String(format!("${}", format_flight_id(id))))
}

fn encode_props(
  model: &Value,
  state: &mut EncodeState,
  depth: usize,
) -> Result<Value, String> {
  let map = match model.as_object() {
    Some(m) => m,
    None => return Ok(model.clone()),
  };
  let mut out = serde_json::Map::new();
  for (key, value) in map {
    if value.is_null() && key == "key" {
      // Preserve null keys; React Flight expects them.
    }
    if matches!(value, Value::Null) {
      out.insert(key.clone(), Value::Null);
      continue;
    }
    let encoded = encode_model(value, state, depth)?;
    out.insert(key.clone(), encoded);
  }
  Ok(Value::Object(out))
}

fn encode_element_type(
  elem_type: &Value,
  client_wire_ids: &std::collections::HashMap<u64, u64>,
) -> String {
  if let Some(s) = elem_type.as_str() {
    return s.to_string();
  }
  if let Some(obj) = elem_type.as_object() {
    if obj.get("kind").and_then(Value::as_str) == Some("fragment") {
      return "$Sreact.fragment".to_string();
    }
    if obj.get("kind").and_then(Value::as_str) == Some("client-reference") {
      let id = obj.get("id").and_then(Value::as_u64).unwrap_or(0);
      let wire = client_wire_ids.get(&id).copied().unwrap_or(id);
      return format!("$L{}", format_flight_id(wire));
    }
  }
  // Fallback — stringify whatever it is.
  elem_type.to_string()
}

fn encode_error_model(model: &Value) -> Value {
  let digest = model
    .get("digest")
    .and_then(Value::as_str)
    .unwrap_or("")
    .to_string();
  let name = model.get("name").and_then(Value::as_str).unwrap_or("Error");
  let message = model
    .get("message")
    .and_then(Value::as_str)
    .unwrap_or("React Flight error.");
  json!({
    "digest": digest,
    "name": name,
    "message": message,
    "stack": [],
    "env": "Server",
  })
}

fn allocate_outline_row(state: &mut EncodeState, payload: Value) -> u64 {
  let id = state.next_wire_id;
  state.next_wire_id += 1;
  state.rows.push(format!(
    "{}:{}",
    format_flight_id(id),
    serde_json::to_string(&payload).expect("outline payload is serializable")
  ));
  id
}

fn format_flight_id(id: u64) -> String {
  format!("{id:x}")
}

/// Parse JSON without serde_json's default 128-level recursion limit
/// (we enforce our own `MAX_FLIGHT_DECODE_DEPTH = 256` cap during the
/// walk so the parser must let us see the full tree). At our cap level
/// the platform stack is comfortable: ~300 frames * ~200 bytes ≈ 60 KB
/// against the 8 MB default.
fn parse_json_without_recursion_limit(input: &str) -> Result<Value, serde_json::Error> {
  use serde::Deserialize;
  let mut deserializer = serde_json::Deserializer::from_str(input);
  deserializer.disable_recursion_limit();
  Value::deserialize(&mut deserializer)
}

#[cfg(not(test))]
#[napi(js_name = "encodeFlightResponse")]
pub fn napi_encode_flight_response(response_json: String) -> napi::Result<String> {
  encode_flight_response(&response_json).map_err(Error::from_reason)
}

// ---------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------

/// Decode a `\n`-separated Flight row payload into a JSON-serialized
/// `FlightResponse` shape the JS callsite can JSON.parse back into a
/// FlightResponse object.
///
/// Mirrors `fromReactFlightRows` at flight.ts:535 + the row parser at
/// flight.ts:958 + the string/value decoders at flight.ts:1209/1259.
pub fn decode_flight_rows(rows: &str) -> Result<String, String> {
  let lines: Vec<&str> = rows.split('\n').filter(|line| !line.is_empty()).collect();

  // Fast-path: `M0:` + `J0:` metadata format (used by streaming
  // pipelines that wrap a JSON-pre-encoded model alongside metadata).
  if let (Some(metadata_line), Some(root_line)) = (
    lines.iter().find(|l| l.starts_with("M0:")),
    lines.iter().find(|l| l.starts_with("J0:")),
  ) {
    let metadata = parse_json_without_recursion_limit(&metadata_line[3..])
      .map_err(|e| format!("Invalid metadata row: {e}"))?;
    let root = parse_json_without_recursion_limit(&root_line[3..])
      .map_err(|e| format!("Invalid root row: {e}"))?;
    let mut response = metadata;
    if let Some(map) = response.as_object_mut() {
      map.insert("root".to_string(), root);
    }
    return Ok(response.to_string());
  }

  let mut client_refs: Vec<Value> = Vec::new();
  let mut server_refs: Vec<Value> = Vec::new();
  let mut model_chunks: std::collections::HashMap<u64, Value> =
    std::collections::HashMap::new();
  let mut error_chunks: std::collections::HashMap<u64, Value> =
    std::collections::HashMap::new();
  let mut explicit_root: Option<Value> = None;

  // First pass: collect chunks + I/F/E rows.
  let mut parsed_rows: Vec<(u64, Option<u8>, String)> = Vec::with_capacity(lines.len());
  for line in &lines {
    let (id, tag, body) = parse_row(line)?;
    parsed_rows.push((id, tag, body));
  }

  for (id, tag, body) in &parsed_rows {
    match tag {
      Some(b'I') => {
        client_refs.push(parse_client_reference(*id, body)?);
      }
      Some(b'T') => {
        let chunk = parse_text_chunk(body)?;
        model_chunks.insert(*id, Value::String(chunk));
      }
      Some(b'A') | Some(b'O') | Some(b'o') | Some(b'U') | Some(b'S') | Some(b's')
      | Some(b'L') | Some(b'l') | Some(b'G') | Some(b'g') | Some(b'M') | Some(b'm')
      | Some(b'V') => {
        let chunk = parse_binary_chunk(tag.unwrap(), body)?;
        model_chunks.insert(*id, chunk);
      }
      Some(b'E') => {
        let parsed = parse_error_payload(body);
        error_chunks.insert(*id, parsed.clone());
        if *id == 0 {
          explicit_root = Some(parsed);
        }
      }
      Some(b'H') | Some(b'N') | Some(b'P') | Some(b'D') | Some(b'J') | Some(b'W')
      | Some(b'R') | Some(b'r') | Some(b'X') | Some(b'x') | Some(b'C') => {
        // Metadata rows — skipped.
      }
      Some(other) => {
        return Err(format!(
          "Unsupported React Flight row tag: {}",
          *other as char
        ));
      }
      None => {
        if !body.is_empty() {
          let parsed = parse_json_without_recursion_limit(body)
            .map_err(|e| format!("Invalid Flight chunk JSON at row {id}: {e}"))?;
          model_chunks.insert(*id, parsed);
        }
      }
    }
  }

  // Second pass: F rows depend on model_chunks for `bound` decoding.
  for (id, tag, body) in &parsed_rows {
    if *tag == Some(b'F') {
      server_refs.push(parse_server_reference(*id, body, &model_chunks, &error_chunks)?);
    }
  }

  let root = if let Some(explicit) = explicit_root {
    explicit
  } else if let Some(raw) = model_chunks.get(&0).cloned() {
    decode_model(&raw, &model_chunks, &error_chunks, 0)?
  } else {
    return Err("Invalid React Flight rows.".to_string());
  };

  let response = json!({
    "version": 1,
    "root": root,
    "clientReferences": client_refs,
    "serverReferences": server_refs,
  });

  Ok(response.to_string())
}

fn parse_row(line: &str) -> Result<(u64, Option<u8>, String), String> {
  let bytes = line.as_bytes();
  let separator = bytes.iter().position(|&b| b == b':').ok_or_else(|| {
    "Invalid React Flight row.".to_string()
  })?;
  let id = if separator == 0 {
    0
  } else {
    parse_flight_id(&line[..separator])?
  };
  let body = &line[separator + 1..];
  let first = body.as_bytes().first().copied();
  let has_tag = match first {
    Some(c) => is_react_flight_row_tag(c, body),
    None => false,
  };
  if let Some(c) = first {
    if !has_tag && looks_like_unsupported_tag(c, body) {
      return Err(format!(
        "Unsupported React Flight row tag: {}",
        c as char
      ));
    }
  }
  let (tag, payload) = if has_tag {
    (first, body[1..].to_string())
  } else {
    (None, body.to_string())
  };
  Ok((id, tag, payload))
}

fn is_react_flight_row_tag(tag: u8, body: &str) -> bool {
  if matches!(
    tag,
    b'I' | b'F' | b'E' | b'T' | b'H' | b'N' | b'P' | b'D' | b'J' | b'W' | b'R' | b'r'
      | b'X' | b'x' | b'C'
  ) {
    return true;
  }
  if matches!(
    tag,
    b'A' | b'O' | b'o' | b'U' | b'S' | b's' | b'L' | b'l' | b'G' | b'g' | b'M' | b'm' | b'V'
  ) {
    // Body must look like `<hex>+,...` to be a binary row.
    return body_starts_with_hex_then_comma(&body[1..]);
  }
  false
}

fn body_starts_with_hex_then_comma(rest: &str) -> bool {
  let mut seen_hex = false;
  for ch in rest.chars() {
    if ch.is_ascii_hexdigit() {
      seen_hex = true;
      continue;
    }
    return seen_hex && ch == ',';
  }
  false
}

fn looks_like_unsupported_tag(tag: u8, body: &str) -> bool {
  if !tag.is_ascii_uppercase() {
    return false;
  }
  let second = body.as_bytes().get(1).copied();
  matches!(second, Some(b'{') | Some(b'[') | Some(b'"'))
}

fn parse_flight_id(value: &str) -> Result<u64, String> {
  u64::from_str_radix(value, 16).map_err(|e| format!("Invalid Flight id `{value}`: {e}"))
}

fn parse_text_chunk(payload: &str) -> Result<String, String> {
  let comma = payload
    .as_bytes()
    .iter()
    .position(|&b| b == b',')
    .ok_or_else(|| "Invalid React Flight text row.".to_string())?;
  Ok(payload[comma + 1..].to_string())
}

fn parse_binary_chunk(tag: u8, payload: &str) -> Result<Value, String> {
  let comma = payload
    .as_bytes()
    .iter()
    .position(|&b| b == b',')
    .ok_or_else(|| "Invalid React Flight binary row.".to_string())?;
  let declared_len = parse_flight_id(&payload[..comma])?;
  let bytes = decode_base64_bytes(&payload[comma + 1..])?;
  if bytes.len() as u64 != declared_len {
    return Err("React Flight binary row length did not match declared payload length.".to_string());
  }
  Ok(build_binary_model(tag, bytes))
}

fn build_binary_model(tag: u8, bytes: Vec<u8>) -> Value {
  let byte_values: Vec<Value> = bytes.iter().map(|b| json!(*b)).collect();
  if tag == b'A' {
    return json!({ "kind": "array-buffer", "bytes": byte_values });
  }
  if tag == b'V' {
    return json!({ "kind": "data-view", "bytes": byte_values });
  }
  let array_type = match tag {
    b'O' => "Int8Array",
    b'o' => "Uint8Array",
    b'U' => "Uint8ClampedArray",
    b'S' => "Int16Array",
    b's' => "Uint16Array",
    b'L' => "Int32Array",
    b'l' => "Uint32Array",
    b'G' => "Float32Array",
    b'g' => "Float64Array",
    b'M' => "BigInt64Array",
    b'm' => "BigUint64Array",
    _ => "Uint8Array",
  };
  json!({
    "kind": "typed-array",
    "arrayType": array_type,
    "bytes": byte_values,
  })
}

fn parse_client_reference(id: u64, payload: &str) -> Result<Value, String> {
  let parsed = parse_json_without_recursion_limit(payload)
    .map_err(|e| format!("Invalid client reference payload at row {id}: {e}"))?;
  if let Some(array) = parsed.as_array() {
    let module_id = array.first().and_then(Value::as_str).unwrap_or("").to_string();
    let chunks = match array.get(1) {
      Some(Value::Array(items)) => items
        .iter()
        .map(|v| Value::String(v.as_str().unwrap_or("").to_string()))
        .collect::<Vec<_>>(),
      _ => Vec::new(),
    };
    let export_name = array
      .get(2)
      .and_then(Value::as_str)
      .unwrap_or("default")
      .to_string();
    return Ok(json!({
      "id": id,
      "moduleId": module_id,
      "chunks": chunks,
      "exportName": export_name,
    }));
  }
  let obj = parsed.as_object().cloned().unwrap_or_default();
  let module_id = obj
    .get("id")
    .and_then(Value::as_str)
    .or_else(|| obj.get("moduleId").and_then(Value::as_str))
    .unwrap_or("")
    .to_string();
  let chunks: Vec<Value> = obj
    .get("chunks")
    .and_then(Value::as_array)
    .cloned()
    .unwrap_or_default()
    .into_iter()
    .map(|v| Value::String(v.as_str().unwrap_or("").to_string()))
    .collect();
  let export_name = obj
    .get("name")
    .and_then(Value::as_str)
    .or_else(|| obj.get("exportName").and_then(Value::as_str))
    .unwrap_or("default")
    .to_string();
  Ok(json!({
    "id": id,
    "moduleId": module_id,
    "chunks": chunks,
    "exportName": export_name,
  }))
}

fn parse_server_reference(
  id: u64,
  payload: &str,
  model_chunks: &std::collections::HashMap<u64, Value>,
  error_chunks: &std::collections::HashMap<u64, Value>,
) -> Result<Value, String> {
  let parsed = parse_json_without_recursion_limit(payload)
    .map_err(|e| format!("Invalid server reference payload at row {id}: {e}"))?;
  let obj = parsed.as_object().cloned().unwrap_or_default();
  let action_id = obj.get("id").and_then(Value::as_str).unwrap_or("");
  let (module_id, default_export_name) = match action_id.rfind('#') {
    Some(idx) => (action_id[..idx].to_string(), action_id[idx + 1..].to_string()),
    None => (action_id.to_string(), "default".to_string()),
  };
  let export_name = obj
    .get("name")
    .and_then(Value::as_str)
    .map(|s| s.to_string())
    .unwrap_or(default_export_name);

  let bound = match obj.get("bound") {
    Some(Value::Array(items)) => {
      let mut decoded_items = Vec::with_capacity(items.len());
      for item in items {
        decoded_items.push(decode_model(item, model_chunks, error_chunks, 0)?);
      }
      Some(Value::Array(decoded_items))
    }
    _ => None,
  };

  let mut out = serde_json::Map::new();
  out.insert("id".to_string(), json!(id));
  out.insert("moduleId".to_string(), Value::String(module_id));
  out.insert("exportName".to_string(), Value::String(export_name));
  if let Some(b) = bound {
    out.insert("bound".to_string(), b);
  }
  Ok(Value::Object(out))
}

fn parse_error_payload(payload: &str) -> Value {
  let parsed = parse_json_without_recursion_limit(payload).unwrap_or(Value::Null);
  let obj = parsed.as_object().cloned().unwrap_or_default();
  let digest = obj
    .get("digest")
    .and_then(Value::as_str)
    .map(|s| s.to_string());
  let name = obj
    .get("name")
    .and_then(Value::as_str)
    .unwrap_or("Error")
    .to_string();
  let message = obj
    .get("message")
    .and_then(Value::as_str)
    .unwrap_or("React Flight error.")
    .to_string();
  let mut out = serde_json::Map::new();
  out.insert("kind".to_string(), Value::String("error".to_string()));
  out.insert("name".to_string(), Value::String(name));
  out.insert("message".to_string(), Value::String(message));
  if let Some(d) = digest {
    out.insert("digest".to_string(), Value::String(d));
  }
  Value::Object(out)
}

fn decode_model(
  value: &Value,
  model_chunks: &std::collections::HashMap<u64, Value>,
  error_chunks: &std::collections::HashMap<u64, Value>,
  depth: usize,
) -> Result<Value, String> {
  if depth > MAX_FLIGHT_DECODE_DEPTH {
    return Err(format!(
      "MR_FLIGHT_TOO_DEEP: nested deeper than {MAX_FLIGHT_DECODE_DEPTH} levels"
    ));
  }
  match value {
    Value::Null | Value::Bool(_) | Value::Number(_) => Ok(value.clone()),
    Value::String(s) => decode_string(s, model_chunks, error_chunks),
    Value::Array(items) => {
      // Element shape: `["$", type, key, props]`.
      if items.first().and_then(Value::as_str) == Some("$") {
        let elem_type = items.get(1).cloned().unwrap_or(Value::Null);
        let key = items.get(2).cloned().unwrap_or(Value::Null);
        let props = items.get(3).cloned().unwrap_or(json!({}));
        let key_value = match key {
          Value::String(s) => Value::String(s),
          _ => Value::Null,
        };
        let decoded_type = decode_element_type(&elem_type);
        let decoded_props = decode_props(&props, model_chunks, error_chunks, depth + 1)?;
        return Ok(json!({
          "kind": "element",
          "type": decoded_type,
          "key": key_value,
          "props": decoded_props,
        }));
      }
      let mut decoded = Vec::with_capacity(items.len());
      for item in items {
        decoded.push(decode_model(item, model_chunks, error_chunks, depth + 1)?);
      }
      Ok(Value::Array(decoded))
    }
    Value::Object(obj) => {
      let kind = obj.get("kind").and_then(Value::as_str);
      if matches!(kind, Some("array-buffer") | Some("typed-array") | Some("data-view")) {
        return Ok(value.clone());
      }
      decode_props(value, model_chunks, error_chunks, depth + 1)
    }
  }
}

fn decode_string(
  value: &str,
  model_chunks: &std::collections::HashMap<u64, Value>,
  error_chunks: &std::collections::HashMap<u64, Value>,
) -> Result<Value, String> {
  if value == "$undefined" || value == "$u" {
    return Ok(json!({ "kind": "undefined" }));
  }
  if let Some(rest) = value.strip_prefix("$$") {
    return Ok(Value::String(format!("${rest}")));
  }
  match value {
    "$I" => return Ok(json!({ "kind": "number", "value": "Infinity" })),
    "$-Infinity" => return Ok(json!({ "kind": "number", "value": "-Infinity" })),
    "$-0" => return Ok(json!({ "kind": "number", "value": "-0" })),
    "$N" => return Ok(json!({ "kind": "number", "value": "NaN" })),
    _ => {}
  }
  if let Some(rest) = value.strip_prefix("$D") {
    return Ok(json!({ "kind": "date", "value": rest }));
  }
  if let Some(rest) = value.strip_prefix("$n") {
    return Ok(json!({ "kind": "bigint", "value": rest }));
  }
  if let Some(rest) = value.strip_prefix("$S") {
    return Ok(json!({ "kind": "symbol", "name": rest }));
  }
  if let Some(rest) = value.strip_prefix("$F") {
    let id = parse_flight_id(rest)?;
    return Ok(json!({ "kind": "server-reference", "id": id }));
  }
  if let Some(rest) = value.strip_prefix("$L") {
    let id = parse_flight_id(rest)?;
    return Ok(json!({ "kind": "client-reference", "id": id }));
  }
  if let Some(rest) = value.strip_prefix("$@") {
    let id = if rest.is_empty() {
      0
    } else {
      parse_flight_id(rest)?
    };
    return Ok(json!({ "kind": "promise", "id": id }));
  }
  if let Some(rest) = value.strip_prefix("$Q") {
    let decoded = decode_chunk_ref(rest, model_chunks, error_chunks)?;
    let entries = decoded
      .as_array()
      .cloned()
      .unwrap_or_default()
      .into_iter()
      .map(|entry| match entry {
        Value::Array(pair) => {
          let k = pair.first().cloned().unwrap_or(json!({ "kind": "undefined" }));
          let v = pair.get(1).cloned().unwrap_or(json!({ "kind": "undefined" }));
          Value::Array(vec![k, v])
        }
        other => Value::Array(vec![other, json!({ "kind": "undefined" })]),
      })
      .collect();
    return Ok(json!({ "kind": "map", "entries": Value::Array(entries) }));
  }
  if let Some(rest) = value.strip_prefix("$W") {
    let decoded = decode_chunk_ref(rest, model_chunks, error_chunks)?;
    let values = decoded.as_array().cloned().unwrap_or_default();
    return Ok(json!({ "kind": "set", "values": values }));
  }
  if let Some(rest) = value.strip_prefix("$K") {
    let decoded = decode_chunk_ref(rest, model_chunks, error_chunks)?;
    let entries: Vec<Value> = decoded
      .as_array()
      .cloned()
      .unwrap_or_default()
      .into_iter()
      .filter_map(|entry| match entry {
        Value::Array(pair) => {
          let key = pair.first().and_then(Value::as_str)?.to_string();
          let value = pair.get(1).cloned().unwrap_or(json!({ "kind": "undefined" }));
          Some(Value::Array(vec![Value::String(key), value]))
        }
        _ => None,
      })
      .collect();
    return Ok(json!({ "kind": "form-data", "entries": entries }));
  }
  if let Some(rest) = value.strip_prefix("$i") {
    let decoded = decode_chunk_ref(rest, model_chunks, error_chunks)?;
    let values = decoded.as_array().cloned().unwrap_or_default();
    return Ok(json!({ "kind": "iterable", "values": values }));
  }
  if let Some(rest) = value.strip_prefix("$Z") {
    let id = parse_flight_id(rest)?;
    if let Some(err) = error_chunks.get(&id) {
      return Ok(err.clone());
    }
    return Ok(json!({
      "kind": "error",
      "name": "Error",
      "message": "Unknown React Flight error.",
    }));
  }
  if value == "$Y" || value.starts_with("$E") {
    return Ok(json!({ "kind": "undefined" }));
  }
  if let Some(rest) = value.strip_prefix('$') {
    if !rest.is_empty() && rest.chars().all(|c| c.is_ascii_hexdigit()) {
      return decode_chunk_ref(rest, model_chunks, error_chunks);
    }
  }
  Ok(Value::String(value.to_string()))
}

fn decode_chunk_ref(
  rest: &str,
  model_chunks: &std::collections::HashMap<u64, Value>,
  error_chunks: &std::collections::HashMap<u64, Value>,
) -> Result<Value, String> {
  let id = parse_flight_id(rest)?;
  if let Some(err) = error_chunks.get(&id) {
    return Ok(err.clone());
  }
  let chunk = match model_chunks.get(&id) {
    Some(c) => c.clone(),
    None => return Ok(json!({ "kind": "promise", "id": id })),
  };
  decode_model(&chunk, model_chunks, error_chunks, 0)
}

fn decode_element_type(value: &Value) -> Value {
  if let Some(s) = value.as_str() {
    if s == "$Sreact.fragment" {
      return json!({ "kind": "fragment" });
    }
    if let Some(rest) = s.strip_prefix("$L") {
      if let Ok(id) = parse_flight_id(rest) {
        return json!({ "kind": "client-reference", "id": id });
      }
    }
    return Value::String(s.to_string());
  }
  Value::String(value.to_string())
}

fn decode_props(
  value: &Value,
  model_chunks: &std::collections::HashMap<u64, Value>,
  error_chunks: &std::collections::HashMap<u64, Value>,
  depth: usize,
) -> Result<Value, String> {
  if depth > MAX_FLIGHT_DECODE_DEPTH {
    return Err(format!(
      "MR_FLIGHT_TOO_DEEP: nested deeper than {MAX_FLIGHT_DECODE_DEPTH} levels"
    ));
  }
  let obj = match value.as_object() {
    Some(o) => o,
    None => return Ok(value.clone()),
  };
  let mut out = serde_json::Map::new();
  for (key, child) in obj {
    let decoded = decode_model(child, model_chunks, error_chunks, depth + 1)?;
    out.insert(key.clone(), decoded);
  }
  Ok(Value::Object(out))
}

#[cfg(not(test))]
#[napi(js_name = "decodeFlightRows")]
pub fn napi_decode_flight_rows(rows: String) -> napi::Result<String> {
  decode_flight_rows(&rows).map_err(Error::from_reason)
}

#[cfg(not(test))]
#[napi(js_name = "mergeFlightRows")]
pub fn napi_merge_flight_rows(prev_json: String, rows: String) -> napi::Result<String> {
  merge_flight_rows(&prev_json, &rows).map_err(Error::from_reason)
}

pub fn merge_flight_rows(prev_json: &str, rows: &str) -> Result<String, String> {
  let prev = parse_json_without_recursion_limit(prev_json)
    .map_err(|e| format!("Invalid previous Flight response JSON: {e}"))?;
  let lines: Vec<&str> = rows.split('\n').filter(|line| !line.is_empty()).collect();

  let mut client_refs = prev
    .get("clientReferences")
    .and_then(Value::as_array)
    .cloned()
    .unwrap_or_default();
  let mut server_refs = prev
    .get("serverReferences")
    .and_then(Value::as_array)
    .cloned()
    .unwrap_or_default();
  let mut model_chunks: std::collections::HashMap<u64, Value> =
    std::collections::HashMap::new();
  let mut error_chunks: std::collections::HashMap<u64, Value> =
    std::collections::HashMap::new();

  let mut parsed_rows: Vec<(u64, Option<u8>, String)> = Vec::with_capacity(lines.len());
  for line in &lines {
    parsed_rows.push(parse_row(line)?);
  }

  for (id, tag, body) in &parsed_rows {
    match tag {
      Some(b'I') => client_refs.push(parse_client_reference(*id, body)?),
      Some(b'T') => {
        model_chunks.insert(*id, Value::String(parse_text_chunk(body)?));
      }
      Some(b'A') | Some(b'O') | Some(b'o') | Some(b'U') | Some(b'S') | Some(b's')
      | Some(b'L') | Some(b'l') | Some(b'G') | Some(b'g') | Some(b'M') | Some(b'm')
      | Some(b'V') => {
        model_chunks.insert(*id, parse_binary_chunk(tag.unwrap(), body)?);
      }
      Some(b'E') => {
        error_chunks.insert(*id, parse_error_payload(body));
      }
      Some(b'H') | Some(b'N') | Some(b'P') | Some(b'D') | Some(b'J') | Some(b'W')
      | Some(b'R') | Some(b'r') | Some(b'X') | Some(b'x') | Some(b'C') => {}
      Some(other) => {
        return Err(format!(
          "Unsupported React Flight row tag: {}",
          *other as char
        ));
      }
      None => {
        if !body.is_empty() {
          let parsed = parse_json_without_recursion_limit(body)
            .map_err(|e| format!("Invalid Flight chunk JSON at row {id}: {e}"))?;
          model_chunks.insert(*id, parsed);
        }
      }
    }
  }

  for (id, tag, body) in &parsed_rows {
    if *tag == Some(b'F') {
      server_refs.push(parse_server_reference(*id, body, &model_chunks, &error_chunks)?);
    }
  }

  let merged_root = prev.get("root").cloned().unwrap_or(Value::Null);
  let resolved_root = resolve_promise_chunks(&merged_root, &model_chunks, &error_chunks)?;

  Ok(json!({
    "version": prev.get("version").cloned().unwrap_or(json!(1)),
    "root": resolved_root,
    "clientReferences": client_refs,
    "serverReferences": server_refs,
  })
  .to_string())
}

fn resolve_promise_chunks(
  value: &Value,
  model_chunks: &std::collections::HashMap<u64, Value>,
  error_chunks: &std::collections::HashMap<u64, Value>,
) -> Result<Value, String> {
  match value {
    Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => Ok(value.clone()),
    Value::Array(items) => {
      let mut out = Vec::with_capacity(items.len());
      for item in items {
        out.push(resolve_promise_chunks(item, model_chunks, error_chunks)?);
      }
      Ok(Value::Array(out))
    }
    Value::Object(obj) => {
      let kind = obj.get("kind").and_then(Value::as_str);
      if kind == Some("promise") {
        let id = obj.get("id").and_then(Value::as_u64).unwrap_or(0);
        if let Some(err) = error_chunks.get(&id) {
          return Ok(err.clone());
        }
        if let Some(chunk) = model_chunks.get(&id) {
          return decode_model(chunk, model_chunks, error_chunks, 0);
        }
        return Ok(value.clone());
      }
      if kind == Some("element") {
        let mut out = obj.clone();
        if let Some(Value::Object(props)) = out.get("props").cloned() {
          let mut resolved = serde_json::Map::new();
          for (key, child) in props {
            resolved.insert(key, resolve_promise_chunks(&child, model_chunks, error_chunks)?);
          }
          out.insert("props".to_string(), Value::Object(resolved));
        }
        return Ok(Value::Object(out));
      }
      if kind == Some("map") {
        let mut out = obj.clone();
        if let Some(Value::Array(entries)) = out.get("entries").cloned() {
          let mut resolved = Vec::with_capacity(entries.len());
          for entry in entries {
            if let Value::Array(pair) = entry {
              let k = pair.first().cloned().unwrap_or(Value::Null);
              let v = pair.get(1).cloned().unwrap_or(Value::Null);
              resolved.push(Value::Array(vec![
                resolve_promise_chunks(&k, model_chunks, error_chunks)?,
                resolve_promise_chunks(&v, model_chunks, error_chunks)?,
              ]));
            }
          }
          out.insert("entries".to_string(), Value::Array(resolved));
        }
        return Ok(Value::Object(out));
      }
      if kind == Some("set") {
        let mut out = obj.clone();
        if let Some(Value::Array(values)) = out.get("values").cloned() {
          let mut resolved = Vec::with_capacity(values.len());
          for v in values {
            resolved.push(resolve_promise_chunks(&v, model_chunks, error_chunks)?);
          }
          out.insert("values".to_string(), Value::Array(resolved));
        }
        return Ok(Value::Object(out));
      }
      if kind.is_some() {
        return Ok(value.clone());
      }
      let mut out = serde_json::Map::new();
      for (key, child) in obj {
        out.insert(key.clone(), resolve_promise_chunks(child, model_chunks, error_chunks)?);
      }
      Ok(Value::Object(out))
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn decodes_standard_alphabet() {
    // base64("hello") = "aGVsbG8="
    let result = decode_base64_bytes("aGVsbG8=").unwrap();
    assert_eq!(result, b"hello");
  }

  #[test]
  fn decodes_url_safe_alphabet() {
    // The bytes 0xFB, 0xFF, 0xBF encode to "+/+/" (standard) /
    // "-_-_" (url-safe); use a payload that exercises both `-` and `_`.
    let standard = decode_base64_bytes("+/+/").unwrap();
    let url_safe = decode_base64_bytes("-_-_").unwrap();
    assert_eq!(standard, url_safe);
  }

  #[test]
  fn tolerates_missing_padding() {
    // "aGVsbG8" with no `=` padding still decodes to "hello" because
    // the JS callsite pads to a multiple of 4 with `=` before decoding.
    let result = decode_base64_bytes("aGVsbG8").unwrap();
    assert_eq!(result, b"hello");
  }

  #[test]
  fn round_trips_arbitrary_byte_range() {
    // 0..255 base64-encodes to a 344-byte string in the standard
    // alphabet, including `+` / `/` characters. Verify we can decode
    // it back exactly. (Encoded via Node's `btoa` ahead of time.)
    let encoded = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXV5fYGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6e3x9fn+AgYKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en6ChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+/w==";
    let decoded = decode_base64_bytes(encoded).unwrap();
    assert_eq!(decoded.len(), 256);
    for (i, byte) in decoded.iter().enumerate() {
      assert_eq!(*byte as usize, i);
    }
  }

  #[test]
  fn rejects_invalid_character() {
    let err = decode_base64_bytes("!!!!").unwrap_err();
    assert!(err.contains("Invalid base64 character"), "{err}");
  }

  fn flight_response(root: Value) -> String {
    serde_json::to_string(&json!({
      "version": 1,
      "root": root,
      "clientReferences": [],
      "serverReferences": [],
    }))
    .unwrap()
  }

  #[test]
  fn encodes_primitive_root() {
    assert_eq!(
      encode_flight_response(&flight_response(Value::Null)).unwrap(),
      "0:null",
    );
    assert_eq!(
      encode_flight_response(&flight_response(json!(42))).unwrap(),
      "0:42",
    );
    assert_eq!(
      encode_flight_response(&flight_response(json!(true))).unwrap(),
      "0:true",
    );
    assert_eq!(
      encode_flight_response(&flight_response(json!("hello"))).unwrap(),
      "0:\"hello\"",
    );
  }

  #[test]
  fn encodes_dollar_prefixed_strings_with_doubling() {
    assert_eq!(
      encode_flight_response(&flight_response(json!("$dangerous"))).unwrap(),
      "0:\"$$dangerous\"",
    );
  }

  #[test]
  fn encodes_typed_models_with_wire_prefixes() {
    let date = encode_flight_response(&flight_response(json!({
      "kind": "date", "value": "2026-05-13T00:00:00.000Z"
    })))
    .unwrap();
    assert_eq!(date, "0:\"$D2026-05-13T00:00:00.000Z\"");

    let bigint =
      encode_flight_response(&flight_response(json!({ "kind": "bigint", "value": "42" })))
        .unwrap();
    assert_eq!(bigint, "0:\"$n42\"");

    let infinity =
      encode_flight_response(&flight_response(json!({ "kind": "number", "value": "Infinity" })))
        .unwrap();
    assert_eq!(infinity, "0:\"$I\"");

    let nan =
      encode_flight_response(&flight_response(json!({ "kind": "number", "value": "NaN" })))
        .unwrap();
    assert_eq!(nan, "0:\"$N\"");

    let neg_zero =
      encode_flight_response(&flight_response(json!({ "kind": "number", "value": "-0" })))
        .unwrap();
    assert_eq!(neg_zero, "0:\"$-0\"");

    let symbol =
      encode_flight_response(&flight_response(json!({ "kind": "symbol", "name": "Symbol.foo" })))
        .unwrap();
    assert_eq!(symbol, "0:\"$SSymbol.foo\"");

    let undef = encode_flight_response(&flight_response(json!({ "kind": "undefined" }))).unwrap();
    assert_eq!(undef, "0:\"$u\"");
  }

  #[test]
  fn encodes_reference_ids_in_hexadecimal() {
    let mut state = EncodeState {
      client_wire_ids: std::collections::HashMap::from([(255, 255)]),
      server_wire_ids: std::collections::HashMap::from([(255, 255)]),
      rows: Vec::new(),
      next_wire_id: 1,
    };

    assert_eq!(
      encode_model(&json!({ "kind": "server-reference", "id": 255 }), &mut state, 0)
        .unwrap(),
      json!("$Fff"),
    );
    assert_eq!(
      encode_model(&json!({ "kind": "client-reference", "id": 255 }), &mut state, 0)
        .unwrap(),
      json!("$Lff"),
    );
    assert_eq!(
      encode_element_type(
        &json!({ "kind": "client-reference", "id": 255 }),
        &state.client_wire_ids,
      ),
      "$Lff",
    );
  }

  #[test]
  fn encodes_binary_models_as_outline_rows() {
    let cases = [
      (json!({ "kind": "array-buffer", "bytes": [1, 2, 3, 4] }), "A"),
      (
        json!({ "kind": "typed-array", "arrayType": "Uint8Array", "bytes": [1, 2, 3, 4] }),
        "o",
      ),
      (
        json!({ "kind": "typed-array", "arrayType": "Int16Array", "bytes": [1, 2, 3, 4] }),
        "S",
      ),
      (json!({ "kind": "data-view", "bytes": [1, 2, 3, 4] }), "V"),
    ];

    for (model, tag) in cases {
      let rows = encode_flight_response(&flight_response(model)).unwrap();
      assert!(rows.contains(&format!("1:{tag}4,AQIDBA==")), "{rows}");
      assert!(rows.contains("0:\"$1\""), "{rows}");
    }
  }

  #[test]
  fn encodes_map_via_outline_row() {
    let map_model = json!({
      "kind": "map",
      "entries": [["k", "v"]],
    });
    let rows = encode_flight_response(&flight_response(map_model)).unwrap();
    // The map allocates an outline row, then the root references it
    // by id ("$Q<hex>"). The wire id starts at 1.
    assert!(rows.contains("1:[[\"k\",\"v\"]]"));
    assert!(rows.contains("0:\"$Q1\""));
  }

  #[test]
  fn enforces_depth_cap_on_encode() {
    // Build a 300-level nested array and verify `encode_model` refuses
    // it before recursing past the cap. Runs in a dedicated thread
    // with a generous stack because Value's recursive Drop blows the
    // small debug-test stack at this depth; the cap behavior itself is
    // unaffected.
    let result = std::thread::Builder::new()
      .stack_size(32 * 1024 * 1024)
      .spawn(|| {
        let mut nested = json!(0);
        for _ in 0..300 {
          nested = Value::Array(vec![nested]);
        }
        let mut state = EncodeState {
          client_wire_ids: std::collections::HashMap::new(),
          server_wire_ids: std::collections::HashMap::new(),
          rows: Vec::new(),
          next_wire_id: 1,
        };
        encode_model(&nested, &mut state, 0).unwrap_err()
      })
      .unwrap()
      .join()
      .unwrap();
    assert!(result.contains("MR_FLIGHT_TOO_DEEP"), "{result}");
  }

  // -------- decoder tests --------

  fn decode_root(root_value: Value) -> Value {
    let rows = encode_flight_response(&flight_response(root_value)).unwrap();
    let decoded_json = decode_flight_rows(&rows).unwrap();
    let response: Value = serde_json::from_str(&decoded_json).unwrap();
    response.get("root").cloned().unwrap()
  }

  #[test]
  fn round_trips_primitives() {
    assert_eq!(decode_root(json!(42)), json!(42));
    assert_eq!(decode_root(Value::Null), Value::Null);
    assert_eq!(decode_root(json!("hello")), json!("hello"));
  }

  #[test]
  fn round_trips_dollar_prefixed_string() {
    assert_eq!(decode_root(json!("$dangerous")), json!("$dangerous"));
  }

  #[test]
  fn round_trips_special_numbers() {
    let infinity = decode_root(json!({ "kind": "number", "value": "Infinity" }));
    assert_eq!(infinity, json!({ "kind": "number", "value": "Infinity" }));
    let nan = decode_root(json!({ "kind": "number", "value": "NaN" }));
    assert_eq!(nan, json!({ "kind": "number", "value": "NaN" }));
  }

  #[test]
  fn round_trips_map_via_outline() {
    let map_model = json!({
      "kind": "map",
      "entries": [["k", "v"]],
    });
    assert_eq!(decode_root(map_model.clone()), map_model);
  }

  #[test]
  fn round_trips_typed_array() {
    let model = json!({
      "kind": "typed-array",
      "arrayType": "Uint8Array",
      "bytes": [1, 2, 3, 4],
    });
    assert_eq!(decode_root(model.clone()), model);
  }

  #[test]
  fn parses_react_native_binary_row_format() {
    // The wire format from React's reference encoder uses
    // "<id>:<tag><len>,<base64>" binary rows. We accept and decode
    // these as typed arrays even though our own encoder embeds binary
    // models inline.
    let rows = ["1:o4,AQIDBA==", "0:[\"$\",\"div\",null,{\"bytes\":\"$1\"}]"]
      .join("\n");
    let decoded_json = decode_flight_rows(&rows).unwrap();
    let decoded: Value = serde_json::from_str(&decoded_json).unwrap();
    let bytes = decoded.pointer("/root/props/bytes").unwrap();
    assert_eq!(bytes.get("arrayType").and_then(Value::as_str), Some("Uint8Array"));
    assert_eq!(
      bytes.get("bytes").unwrap(),
      &json!([1, 2, 3, 4]),
    );
  }

  #[test]
  fn keeps_symbols_and_high_row_references_distinct() {
    let rows = ["f0:\"row-240\"", "0:{\"value\":\"$f0\",\"symbol\":\"$S1\"}"]
      .join("\n");
    let decoded_json = decode_flight_rows(&rows).unwrap();
    let decoded: Value = serde_json::from_str(&decoded_json).unwrap();

    assert_eq!(decoded.pointer("/root/value"), Some(&json!("row-240")));
    assert_eq!(
      decoded.pointer("/root/symbol"),
      Some(&json!({ "kind": "symbol", "name": "1" })),
    );
  }

  #[test]
  fn rejects_unsupported_row_tag() {
    let err = decode_flight_rows("1:Z{}").unwrap_err();
    assert!(err.contains("Unsupported React Flight row tag"), "{err}");
  }

  #[test]
  fn merge_attaches_promise_chunks_to_root() {
    // Initial response: root references promise id 1.
    let initial_rows = "0:[\"$\",\"p\",null,{\"children\":\"$@1\"}]";
    let initial = decode_flight_rows(initial_rows).unwrap();
    let merged = merge_flight_rows(&initial, "1:T9,Hello Ada").unwrap();
    let response: Value = serde_json::from_str(&merged).unwrap();
    let children = response.pointer("/root/props/children").unwrap();
    assert_eq!(children, &json!("Hello Ada"));
  }
}
