| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 750.304 | ms |
| virtual measured tail refresh | 8.530 | ms |
| virtual subscribed measured tail refresh | 32.903 | ms |
| virtual 60 frame scroll refresh 100k rows | 13.192 | ms |
| virtual stale measured refresh | 32.744 | ms |
| virtual repeated scrollToKey large list head middle tail | 46.972 | ms |
| query deep-key observer updates | 86.247 | ms |
| query notification fanout 1k observers | 66.202 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 84.397 | ms |
| forms many schema issues on one field | 2.650 | ms |
| forms 100 field sequential key input | 7.133 | ms |
| auth current session with large payload | 31.859 | ms |
