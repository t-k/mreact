| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 51.430 | ms |
| virtual measured tail refresh | 10.660 | ms |
| virtual subscribed measured tail refresh | 1389.826 | ms |
| virtual 60 frame scroll refresh 100k rows | 9.927 | ms |
| virtual stale measured refresh | 15.754 | ms |
| virtual repeated scrollToKey large list head middle tail | 26.950 | ms |
| query deep-key observer updates | 199.640 | ms |
| query notification fanout 1k observers | 144.674 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 54.351 | ms |
| forms many schema issues on one field | 3.219 | ms |
| forms 100 field sequential key input | 4.957 | ms |
| auth current session with large payload | 35.778 | ms |
