# n8n Daily Capture Opportunities output

The unified app expects n8n to write a current-snapshot sheet called `Daily Capture Opportunities`.

Recommended behavior every run:

1. Clear existing rows.
2. Write headers.
3. Write current opportunity rows.
4. Telegram remains optional summary only.

Recommended columns:

- generated_at
- building_key
- building_name
- neighborhood
- priority
- building_status
- dnp_flag
- mute_alerts
- building_size
- media_status
- badges
- floorplan_visibility
- known_floorplan_count
- different_tier_finishes
- distinct_unfilmed_floorplans
- threshold_required
- total_available_units
- units_by_floorplan_json
- last_filmed_date
- filmed_floorplans
- leasing_outreach_status
- leasing_notes
- floorplan_docs_link
- website
- management_company
- notes
- diagnostic_type
- diagnostic_message

The app currently accepts CSV or JSON import for this data from Settings.
