#!/bin/bash
cd "$(dirname "$0")"
echo "Starting... Open http://localhost:8000 in your browser. (Close this window to stop)"
(sleep 1; open http://localhost:8000) &
python3 -m http.server 8000
