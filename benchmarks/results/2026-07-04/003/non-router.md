| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 56.080 | ms |
| virtual measured tail refresh | 10.330 | ms |
| virtual subscribed measured tail refresh | 40.008 | ms |
| virtual 60 frame scroll refresh 100k rows | 13.554 | ms |
| virtual stale measured refresh | 33.621 | ms |
| virtual repeated scrollToKey large list head middle tail | 31.091 | ms |
| query deep-key observer updates | 133.050 | ms |
| query notification fanout 1k observers | 112.935 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 80.890 | ms |
| forms many schema issues on one field | 59.024 | ms |
| forms 100 field sequential key input | 10.065 | ms |
| auth current session with large payload | 32.079 | ms |
