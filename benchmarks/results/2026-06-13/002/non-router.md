| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 38.047 | ms |
| virtual measured tail refresh | 26.272 | ms |
| virtual subscribed measured tail refresh | 37.693 | ms |
| virtual 60 frame scroll refresh 100k rows | 13.326 | ms |
| virtual stale measured refresh | 37.908 | ms |
| virtual repeated scrollToKey large list head middle tail | 28.714 | ms |
| query deep-key observer updates | 126.257 | ms |
| query notification fanout 1k observers | 85.812 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 71.976 | ms |
| forms many schema issues on one field | 3.374 | ms |
| forms 100 field sequential key input | 59.024 | ms |
| auth current session with large payload | 34.407 | ms |
