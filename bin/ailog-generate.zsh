#!/bin/zsh

# Generate AI content for blog posts
# Usage: ./bin/ailog-generate.zsh [md-file]

set -e

# Load configuration
f=~/.config/syui/ai/bot/token.json

# Default values
default_pds="bsky.social"
default_did=`cat $f|jq -r .did`
default_token=`cat $f|jq -r .accessJwt`
default_refresh=`cat $f|jq -r .refreshJwt`

# Refresh token if needed
curl -sL -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $default_refresh" https://$default_pds/xrpc/com.atproto.server.refreshSession >! $f
default_token=`cat $f|jq -r .accessJwt`

# Set variables
admin_did=$default_did
admin_token=$default_token
ai_did="did:plc:4hqjfn7m6n5hno3doamuhgef"
ollama_host="https://ollama.syui.ai"
blog_host="https://syui.ai"
pds=$default_pds

# Parse arguments
md_file=$1

# Function to generate content using Ollama
generate_ai_content() {
    local content=$1
    local prompt_type=$2
    local model="gemma3:4b"
    
    case $prompt_type in
        "translate")
            prompt="Translate the following Japanese blog post to English. Keep the technical terms and code blocks intact:\n\n$content"
            ;;
        "comment")
            prompt="Read this blog post and provide an insightful comment about it. Focus on the key points and add your perspective:\n\n$content"
            ;;
    esac
    
    response=$(curl -sL -X POST "$ollama_host/api/generate" \
        -H "Content-Type: application/json" \
        -d "{
            \"model\": \"$model\",
            \"prompt\": \"$prompt\",
            \"stream\": false,
            \"options\": {
                \"temperature\": 0.9,
                \"top_p\": 0.9,
                \"num_predict\": 500
            }
        }")
    
    echo "$response" | jq -r '.response'
}

# Function to put record to ATProto
put_record() {
    local collection=$1
    local rkey=$2
    local record=$3
    
    curl -sL -X POST "https://$pds/xrpc/com.atproto.repo.putRecord" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $admin_token" \
        -d "{
            \"repo\": \"$admin_did\",
            \"collection\": \"$collection\",
            \"rkey\": \"$rkey\",
            \"record\": $record
        }"
}

# Function to process a single markdown file
process_md_file() {
    local md_path=$1
    local filename=$(basename "$md_path" .md)
    local content=$(cat "$md_path")
    local post_url="$blog_host/posts/$filename"
    local rkey=$filename
    local now=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    
    echo "Processing: $md_path"
    echo "Post URL: $post_url"
    
    # Generate English translation
    echo "Generating English translation..."
    en_translation=$(generate_ai_content "$content" "translate")
    
    if [ -n "$en_translation" ]; then
        lang_record="{
            \"\$type\": \"ai.syui.log.chat.lang\",
            \"type\": \"en\",
            \"body\": $(echo "$en_translation" | jq -Rs .),
            \"url\": \"$post_url\",
            \"createdAt\": \"$now\",
            \"author\": {
                \"did\": \"$ai_did\",
                \"handle\": \"yui.syui.ai\",
                \"displayName\": \"AI Translator\"
            }
        }"
        
        echo "Saving translation to ATProto..."
        put_record "ai.syui.log.chat.lang" "$rkey" "$lang_record"
    fi
    
    # Generate AI comment
    echo "Generating AI comment..."
    ai_comment=$(generate_ai_content "$content" "comment")
    
    if [ -n "$ai_comment" ]; then
        comment_record="{
            \"\$type\": \"ai.syui.log.chat.comment\",
            \"type\": \"push\",
            \"body\": $(echo "$ai_comment" | jq -Rs .),
            \"url\": \"$post_url\",
            \"createdAt\": \"$now\",
            \"author\": {
                \"did\": \"$ai_did\",
                \"handle\": \"yui.syui.ai\",
                \"displayName\": \"AI Commenter\"
            }
        }"
        
        echo "Saving comment to ATProto..."
        put_record "ai.syui.log.chat.comment" "$rkey" "$comment_record"
    fi
    
    echo "Completed: $filename"
    echo
}

# Main logic
if [ -n "$md_file" ]; then
    # Process specific file
    if [ -f "$md_file" ]; then
        process_md_file "$md_file"
    else
        echo "Error: File not found: $md_file"
        exit 1
    fi
else
    # Process all new posts
    echo "Checking for posts without AI content..."
    
    # Get existing records
    existing_langs=$(curl -sL "https://$pds/xrpc/com.atproto.repo.listRecords?repo=$admin_did&collection=ai.syui.log.chat.lang&limit=100" | jq -r '.records[]?.value.url' | sort | uniq)
    
    # Process each markdown file
    for md in my-blog/content/posts/*.md; do
        if [ -f "$md" ]; then
            filename=$(basename "$md" .md)
            post_url="$blog_host/posts/$filename"
            
            # Check if already processed
            if echo "$existing_langs" | grep -q "$post_url"; then
                echo "Skip (already processed): $filename"
            else
                process_md_file "$md"
                sleep 2  # Rate limiting
            fi
        fi
    done
fi

echo "All done!"