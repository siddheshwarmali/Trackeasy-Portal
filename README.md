
# EasyTrack Dashboard on Netlify (Shared Save/Load)

## What this project does
- Hosts the dashboard as a static site (public/index.html)
- Exposes an API at /.netlify/functions/state using Netlify Functions
- Stores shared state using Netlify Blobs (key/value)

## Deploy
1) Upload this folder to a Git repo (GitHub/Azure Repos mirrored) and connect repo in Netlify.
2) Build settings:
   - Base directory: (blank)
   - Publish directory: public
   - Functions directory: netlify/functions
3) Deploy.

## Test
- Open the site URL.
- Click Save in the workspace bar.
- Open the site from another browser/device: it should show the same data.
