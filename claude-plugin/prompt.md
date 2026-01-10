# propt

## Feature

Based on this example script:
https://raw.githubusercontent.com/skeetmtp/remote-claude/refs/heads/main/hook-prompt.js

write a hook script that will be used to handle permission requests.
request is received as json object on stdin and forwarded to webserver (http://localhost:3000 can be overriden with WEB_SERVER_URL env variable)
see https://code.claude.com/docs/en/hooks doc for more details on how to use hooks.

server return json response using this format:

```json
{
  "exitCode": 0,
  "stdout": "...",
}
```

where exitCode is the exit code of the script and stdout is the output of the script.

## Server
For now web server does not exist, so pretend it's already there and working.
If web server is down, it's not a problem, script should just exit with 0 and stdout should be empty.

## Expected result

A hook script in claude-plugin directory.
