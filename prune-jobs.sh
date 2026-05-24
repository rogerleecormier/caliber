#!/bin/bash
# Job Pruning Helper Script
# Makes it easy to prune jobs from the command line

API_URL="https://jobs.spearyx.com/api/v3/jobs/prune"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🧹 Job Pruning Tool"
echo "==================="
echo ""

# Parse arguments
DRY_RUN="true"
SOURCE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --live)
      DRY_RUN="false"
      shift
      ;;
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --help)
      echo "Usage: ./prune-jobs.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --live              Run in live mode (actually delete jobs)"
      echo "  --source <name>     Prune specific source(s), comma-separated"
      echo "                      Examples: Greenhouse, Lever, RemoteOK, Himalayas"
      echo "  --help              Show this help message"
      echo ""
      echo "Examples:"
      echo "  ./prune-jobs.sh                           # Dry run all sources"
      echo "  ./prune-jobs.sh --live                    # Delete stale jobs from all sources"
      echo "  ./prune-jobs.sh --source Greenhouse       # Dry run for Greenhouse only"
      echo "  ./prune-jobs.sh --live --source Lever     # Delete stale Lever jobs"
      echo "  ./prune-jobs.sh --source Greenhouse,Lever # Dry run for multiple sources"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Build URL with query parameters
URL="$API_URL?dryRun=$DRY_RUN"
if [ -n "$SOURCE" ]; then
  URL="$URL&source=$SOURCE"
fi

# Show what we're doing
if [ "$DRY_RUN" = "true" ]; then
  echo -e "${YELLOW}Mode: DRY RUN (no deletions)${NC}"
else
  echo -e "${RED}Mode: LIVE (will delete jobs!)${NC}"
fi

if [ -n "$SOURCE" ]; then
  echo "Sources: $SOURCE"
else
  echo "Sources: ALL"
fi

echo ""
echo "Calling: $URL"
echo ""

# Make the request
RESPONSE=$(curl -s -X POST "$URL" -H "Content-Type: application/json")

# Check if curl succeeded
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Failed to connect to API${NC}"
  exit 1
fi

# Parse and display results
echo "$RESPONSE" | jq -r '
  if .success then
    "✅ Success!\n",
    "Jobs to delete: \(.jobsToDelete)",
    "Jobs deleted: \(.jobsDeleted)",
    "Duration: \(.duration)ms\n",
    if .orphanedJobs | length > 0 then
      "\nOrphaned Jobs:",
      "===============",
      (.orphanedJobs[] | "- [\(.source)] \(.title) at \(.company // "Unknown")")
    else
      "\n✨ No orphaned jobs found!"
    end
  else
    "❌ Error: \(.error)"
  end
'

# Show warning if dry run
if [ "$DRY_RUN" = "true" ]; then
  echo ""
  echo -e "${YELLOW}⚠️  This was a DRY RUN. No jobs were deleted.${NC}"
  echo -e "${YELLOW}   Run with --live to actually delete orphaned jobs.${NC}"
fi
