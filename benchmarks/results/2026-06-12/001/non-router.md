| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 33.476 | ms |
| virtual measured tail refresh | 22.271 | ms |
| virtual subscribed measured tail refresh | 35.417 | ms |
| virtual 60 frame scroll refresh 100k rows | 20.841 | ms |
| virtual stale measured refresh | 19.592 | ms |
| virtual repeated scrollToKey large list head middle tail | 38.624 | ms |
| query deep-key observer updates | 91.672 | ms |
| query notification fanout 1k observers | 80.831 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 71.230 | ms |
| forms many schema issues on one field | 2.602 | ms |
| forms 100 field sequential key input | 8.566 | ms |
| auth current session with large payload | 31.153 | ms |
