---
'@xpert-ai/plugin-live-dashboard': patch
---

Support host-provided TypeORM 0.3.28 and @nestjs/typeorm 11.0.0 by lowering the peer dependency minimums. Pin development dependencies to these supported baselines and keep ORM packages out of production dependencies so the plugin shares the host ORM instance.
