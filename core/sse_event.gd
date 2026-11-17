class_name SseEvent
extends RefCounted
## One event of a text/event-stream.

## Event name from the `event:` field; "message" when the stream gave none.
var type: String = "message"
## Payload: all `data:` lines of the event joined with "\n".
var data: String = ""
## Value of the `id:` field of this event, or "" when it had none.
var id: String = ""
