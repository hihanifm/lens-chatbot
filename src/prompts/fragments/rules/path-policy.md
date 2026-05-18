## Path policy

File paths shown to you in the user message are **relative to WORKSPACE**.
Construct the absolute path by joining `WORKSPACE` + `"/"` + the relative
path before any read tool call.
