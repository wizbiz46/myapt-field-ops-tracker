# Data model

## Buildings
Seeded from Alerts Sheet CSV. Building-level media status and flags live here.

Key V1 statuses:

- No coverage — film needed
- Partial coverage — capture needed
- YouTube usable for MVP
- Complete
- Leasing follow-up needed
- Needs Review

## Captured units
Child records created inside the app:

- building_key
- unit_number
- bed_count
- floorplan_name
- direction
- notes

No video upload in V1.

## Leasing follow-up
Simple fields on building:

- leasing_outreach_status: Not Started / Reached out to leasing / Available on YGL / Received / Denied
- leasing_notes
- floorplan_docs_link

## Partners
Seeded from Claude partner tracker data and editable in localStorage.
