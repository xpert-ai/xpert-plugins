# @xpert-ai/plugin-mariadb

MariaDB database plugin for Xpert. It preserves the legacy `mariadb` strategy,
MariaDB JDBC driver and URL while reusing the public MySQL runner contract.

The unit suite verifies the independent strategy and inherited behavior. Live
query verification requires a MariaDB endpoint and credentials.

This plugin introduces no persisted or global artifacts, so it does not require
a system artifact namespace.
