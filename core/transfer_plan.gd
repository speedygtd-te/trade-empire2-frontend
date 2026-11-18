class_name TransferPlan
extends RefCounted
## Moving items between a host and one of its docked guests (`POST /v2/structures/{host}/
## transfers`): how much an amount button means, whether it fits into the receiving store, and
## the request body. The server decides; this only prepares and previews.

const TO_GUEST := "toGuest"
const TO_HOST := "toHost"


## Whole units an amount choice moves: `choice` units, or everything for 0; never more than
## the sender has.
static func units_for(choice: int, available_units: int) -> int:
	if available_units <= 0:
		return 0
	return available_units if choice <= 0 else mini(choice, available_units)


## Whether `amount` micro-units fit into a store of `capacity` micro-units that holds `used`
## (both at the same time); an unknown capacity (0) does not limit the preview.
static func fits(amount: int, capacity: int, used: int) -> bool:
	return capacity <= 0 or amount <= capacity - used


## The request body for one item.
static func request(guest_id: int, to_guest: bool, item: String, amount: int) -> Dictionary:
	return {
		"guestId": guest_id,
		"direction": TO_GUEST if to_guest else TO_HOST,
		"items": [{"resource": item, "amount": amount}],
	}
