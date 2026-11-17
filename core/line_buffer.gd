class_name LineBuffer
extends RefCounted
## Splits a byte stream into text lines.
##
## Bytes may arrive in arbitrary chunks. A line is only decoded once its terminator has arrived,
## so a multi-byte UTF-8 character split across two chunks is decoded correctly. Terminators are
## LF and CRLF; the terminator is not part of the returned line.

const _LF := 0x0A
const _CR := 0x0D

var _pending := PackedByteArray()


## Appends a chunk and returns every line it completed, in order.
func push(chunk: PackedByteArray) -> PackedStringArray:
	var lines := PackedStringArray()
	_pending.append_array(chunk)
	var start := 0
	while true:
		var terminator := _pending.find(_LF, start)
		if terminator == -1:
			break
		var line_end := terminator
		if line_end > start and _pending[line_end - 1] == _CR:
			line_end -= 1
		lines.append(_pending.slice(start, line_end).get_string_from_utf8())
		start = terminator + 1
	if start > 0:
		_pending = _pending.slice(start)
	return lines


## True while bytes are waiting for their line terminator. A stream that ends in this state
## was cut off mid-line.
func has_pending() -> bool:
	return not _pending.is_empty()


## The unterminated tail as text, for diagnostics.
func pending_text() -> String:
	return _pending.get_string_from_utf8()


func clear() -> void:
	_pending = PackedByteArray()
