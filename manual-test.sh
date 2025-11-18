#!/bin/bash
set -e

echo "==============================================="
echo "Testing Bibliography Duplication Fix"
echo "==============================================="
echo ""
echo "Step 1: Upload main-content.md through the web UI"
echo "Step 2: Check output folder for processed file"
echo "Step 3: Re-upload the processed file"
echo "Step 4: Compare bibliography counts"
echo ""
echo "Press Enter to start watching the output folder..."
read

echo ""
echo "Watching output/ folder for new files..."
echo "Current files:"
ls -lh output/*.md 2>/dev/null || echo "  (none)"
echo ""
echo "Now please:"
echo "1. Go to http://localhost:5000 in your browser"
echo "2. Upload output/main-content.md"
echo "3. Turn OFF 'Prompt for manual citation details'"
echo "4. Wait for processing to complete"
echo "5. Click 'Download Processed Markdown'"
echo ""
echo "Watching for processed file..."

# Watch for new file
INITIAL_COUNT=$(ls output/*.md 2>/dev/null | wc -l)
while true; do
  CURRENT_COUNT=$(ls output/*.md 2>/dev/null | wc -l)
  if [ $CURRENT_COUNT -gt $INITIAL_COUNT ]; then
    echo ""
    echo "✓ New file detected!"
    sleep 1
    NEW_FILE=$(ls -t output/*.md | head -1)
    echo "  File: $NEW_FILE"
    COUNT1=$(grep -c "^[0-9]\+\. <a id=" "$NEW_FILE" 2>/dev/null || echo "0")
    echo "  Bibliography entries: $COUNT1"
    echo ""
    echo "Step 2: Now re-upload this file ($NEW_FILE) and download it again"
    echo "Waiting for second processed file..."
    
    SECOND_INITIAL=$CURRENT_COUNT
    while true; do
      SECOND_COUNT=$(ls output/*.md 2>/dev/null | wc -l)
      if [ $SECOND_COUNT -gt $SECOND_INITIAL ]; then
        echo ""
        echo "✓ Second processed file detected!"
        sleep 1
        SECOND_FILE=$(ls -t output/*.md | head -1)
        echo "  File: $SECOND_FILE"
        COUNT2=$(grep -c "^[0-9]\+\. <a id=" "$SECOND_FILE" 2>/dev/null || echo "0")
        echo "  Bibliography entries: $COUNT2"
        echo ""
        echo "==============================================="
        echo "RESULTS:"
        echo "==============================================="
        echo "First process:  $COUNT1 entries"
        echo "Second process: $COUNT2 entries"
        echo "Difference:     $((COUNT2 - COUNT1)) entries"
        echo ""
        if [ $COUNT1 -eq $COUNT2 ]; then
          echo "✓ SUCCESS: Bibliography counts match!"
          echo "✓ No duplicates added on re-upload"
        else
          echo "✗ FAILURE: Bibliography counts differ"
          echo "✗ $(( COUNT2 - COUNT1 )) duplicate entries added"
        fi
        echo "==============================================="
        exit 0
      fi
      sleep 1
    done
  fi
  sleep 1
done
