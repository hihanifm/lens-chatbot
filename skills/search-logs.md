# Search Logs

Use this skill when the user asks to search for a pattern, error message,
exception, keyword, or string across log files in the workspace.

## Prefer rg over grep

`rg` is significantly faster on large log files. Use it by default.

```bash
# Basic pattern search across all attachments
rg "<pattern>" <workspacePath>/attachments/ --type-add 'log:*.{log,txt,out}' -t log

# Case-insensitive search
rg -i "<pattern>" <workspacePath>/attachments/

# Show context lines around each match (useful for tracing errors)
rg -C 5 "<pattern>" <workspacePath>/attachments/

# Count occurrences per file
rg -c "<pattern>" <workspacePath>/attachments/

# Search inside extracted zip contents too
rg "<pattern>" <workspacePath>/attachments/ --hidden
```

## Tips

- If searching for a Java exception, search for the exception class name without
  the package prefix first, then narrow down.
- For timestamps, use `rg` with a regex: `rg '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'`
- Pipe through `sort | uniq -c | sort -rn` to find the most frequent errors.
- If the log file is large (>100 MB), stream with `rg` rather than loading it whole.
