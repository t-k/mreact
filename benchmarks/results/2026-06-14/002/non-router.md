| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 23.218 | ms |
| virtual measured tail refresh | 15.721 | ms |
| virtual subscribed measured tail refresh | 26.814 | ms |
| virtual 60 frame scroll refresh 100k rows | 15.752 | ms |
| virtual stale measured refresh | 15.366 | ms |
| virtual repeated scrollToKey large list head middle tail | 28.595 | ms |
| query deep-key observer updates | 70.195 | ms |
| query notification fanout 1k observers | 62.415 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 36.021 | ms |
| forms many schema issues on one field | 1.865 | ms |
| forms 100 field sequential key input | 5.592 | ms |
| auth current session with large payload | 26.841 | ms |
