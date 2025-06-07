# ai.log Deployment Guide

## 🌐 Cloudflare Tunnel Setup

ATProto OAuth requires HTTPS for proper CORS handling. Use Cloudflare Tunnel for secure deployment.

### Prerequisites

1. **Install cloudflared**:
   ```bash
   brew install cloudflared
   ```

2. **Login and create tunnel** (if not already done):
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create ailog
   ```

3. **Configure DNS**:
   - Add a CNAME record: `log.syui.ai` → `[tunnel-id].cfargotunnel.com`

### Configuration Files

#### `cloudflared-config.yml`
```yaml
tunnel: a6813327-f880-485d-a9d1-376e6e3df8ad
credentials-file: /Users/syui/.cloudflared/a6813327-f880-485d-a9d1-376e6e3df8ad.json

ingress:
  - hostname: log.syui.ai
    service: http://localhost:8080
    originRequest:
      noHappyEyeballs: true
  - service: http_status:404
```

#### Production Client Metadata
`static/client-metadata-prod.json`:
```json
{
  "client_id": "https://log.syui.ai/client-metadata.json",
  "client_name": "ai.log Blog Comment System",
  "client_uri": "https://log.syui.ai",
  "redirect_uris": ["https://log.syui.ai/"],
  "grant_types": ["authorization_code"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "application_type": "web"
}
```

### Deployment Commands

#### Quick Start
```bash
# All-in-one deployment
./scripts/tunnel.sh
```

#### Manual Steps
```bash
# 1. Build for production
PRODUCTION=true cargo run -- build

# 2. Start local server
cargo run -- serve --port 8080 &

# 3. Start tunnel
cloudflared tunnel --config cloudflared-config.yml run
```

### Environment Detection

The system automatically detects environment:

- **Development** (`localhost:8080`): Uses local client-metadata.json
- **Production** (`log.syui.ai`): Uses HTTPS client-metadata.json

### CORS Resolution

✅ **With Cloudflare Tunnel**:
- HTTPS domain: `https://log.syui.ai`
- Valid SSL certificate
- Proper CORS headers
- ATProto OAuth works correctly

❌ **With localhost**:
- HTTP only: `http://localhost:8080`
- CORS restrictions
- ATProto OAuth may fail

### Troubleshooting

#### ATProto OAuth Errors
```javascript
// Check client metadata URL in browser console
console.log('Environment:', window.location.hostname);
console.log('Client ID:', clientId);
```

#### Tunnel Connection Issues
```bash
# Check tunnel status
cloudflared tunnel info ailog

# Test local server
curl http://localhost:8080/client-metadata.json
```

#### DNS Propagation
```bash
# Check DNS resolution
dig log.syui.ai
nslookup log.syui.ai
```

### Security Notes

- **Client metadata** is publicly accessible (required by ATProto)
- **Credentials file** contains tunnel secrets (keep secure)
- **HTTPS only** for production OAuth
- **Domain validation** by ATProto servers

### Integration with ai.ai Ecosystem

This deployment enables:
- **ai.log**: Comment system with ATProto authentication
- **ai.card**: Shared OAuth widget
- **ai.gpt**: Memory synchronization via ATProto
- **ai.verse**: Future 3D world integration

### Monitoring

```bash
# Monitor tunnel logs
cloudflared tunnel --config cloudflared-config.yml run --loglevel debug

# Monitor blog server
tail -f /path/to/blog/logs

# Check ATProto connectivity
curl -I https://log.syui.ai/client-metadata.json
```

---

**🔗 Live URL**: https://log.syui.ai  
**📊 Status**: Production Ready  
**🌐 ATProto**: OAuth Enabled