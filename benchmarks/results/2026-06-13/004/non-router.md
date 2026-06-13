| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 33.898 | ms |
| virtual measured tail refresh | 20.503 | ms |
| virtual subscribed measured tail refresh | 33.424 | ms |
| virtual 60 frame scroll refresh 100k rows | 20.889 | ms |
| virtual stale measured refresh | 19.890 | ms |
| virtual repeated scrollToKey large list head middle tail | 36.461 | ms |
| query deep-key observer updates | 89.446 | ms |
| query notification fanout 1k observers | 80.926 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 54.694 | ms |
| forms many schema issues on one field | 2.365 | ms |
| forms 100 field sequential key input | 6.744 | ms |
| auth current session with large payload | 35.101 | ms |
