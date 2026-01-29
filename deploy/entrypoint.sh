#!/bin/sh

# Inject API_KEY into index.html
# We search for the specific placeholder string "PLACEHOLDER_API_KEY" and replace it.
# If the API_KEY environment variable is set, it will be used.
# If not, the placeholder is removed (empty string).

if [ -n "$API_KEY" ]; then
  echo "Injecting API_KEY..."
  sed -i "s|PLACEHOLDER_API_KEY|$API_KEY|g" /usr/share/nginx/html/index.html
else
  echo "No API_KEY provided. Manual Mode enabled."
  sed -i "s|PLACEHOLDER_API_KEY||g" /usr/share/nginx/html/index.html
fi

# Execute the CMD passed to docker run (usually nginx)
exec "$@"
