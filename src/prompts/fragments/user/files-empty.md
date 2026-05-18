No files are pre-selected — you MUST explore the workspace before answering. Follow these steps in order:

  1. Read `{{workspace}}/bug_summary.md` for bug context and clues to what to look for.
  2. List the attachments directory:
     `find "{{workspace}}/attachments" -maxdepth 3 -type f | sort`
     If it is missing or empty, say so and answer from bug_summary.md only.
  3. Extract any zip archives once (idempotent):
     `for z in "{{workspace}}"/attachments/*.zip; do unzip -n -q "$z" -d "{{workspace}}/attachments/$(basename "$z" .zip)"; done`
  4. Use the Android file → topic reference in the environment context to identify the 2–5 files most likely to answer the question. Do not read everything.
  5. Read those files (use `rg` for large logs) and answer using the Android RCA template when appropriate.
  6. If nothing relevant is found, list what you checked, explain why it did not apply, and ask the user to attach the relevant log(s). Do not fabricate from general Android knowledge.
