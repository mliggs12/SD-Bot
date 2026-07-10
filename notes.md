# Notes

## Next Steps

Scrape Search Results Page

1. Number is the Default (7136214663):
    - Store number and show in popup with a Default number message
    - Don't try to search the number
2. Number is not found:
    - Store number and show in popup with a Not found message
    - Close search results tab
3. Search results finds a Requesters heading with only 1 Requester:
    - Open new tab with the url found to Requester page (this forces some page interaction to open Asset tab)
    - OR, grab Requester name and do a new search
    - Find the list with the heading Inventory and scrape available assets
4. Search list of tickets and identify one similar requester name:
    - Repeat same process as 3
