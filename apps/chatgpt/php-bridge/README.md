# NewsMAN PHP Bridge

Use this bridge on shared hosting when Node.js is not available.

## Upload

Create this folder on the hosting account:

```text
wpnov.plugindev.eu/gg/newsman-ai-sync
```

Upload these files into it:

```text
.htaccess
index.php
config.sample.php
```

Copy `config.sample.php` to `config.php` on the server and set only:

```php
define('CHATGPT_ACTION_API_KEY', 'replace-with-a-random-action-key');
```

Do not commit or share `config.php`.

## GPT Builder

Use this server URL in `apps/chatgpt/openapi.yaml`:

```yaml
servers:
  - url: https://wpnov.plugindev.eu/gg/newsman-ai-sync
```

If the hosting account redirects path-style routes, use the query-string schema style instead:

```yaml
servers:
  - url: https://wpnov.plugindev.eu/gg/newsman-ai-sync/index.php
```

and paths like:

```yaml
/:
  post:
    parameters:
      - in: query
        name: tool
```

Health check fallback:

```text
https://wpnov.plugindev.eu/gg/newsman-ai-sync/index.php?route=health
```

Then configure GPT Action authentication:

- Type: API key
- Authorization type: Bearer
- API key value: the same value from `CHATGPT_ACTION_API_KEY`

Users can provide their NewsMAN credentials in Action fields:

- `newsman_user_id`
- `newsman_api_key`

The bridge removes these fields before calling NewsMAN and does not echo them in responses.
