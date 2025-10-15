# FOOPTRA Public API Documentation

Base URL: `https://sso.fooptra.com/api/public`

All endpoints are **publicly accessible** without authentication.

---

## 🔍 Search Users

Search for users by name.

**Endpoint:** `GET /api/public/users/search`

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | - | Search query (name) |
| `limit` | number | No | 10 | Results per page (max 50) |
| `offset` | number | No | 0 | Pagination offset |

**Example Request:**
```bash
curl "https://sso.fooptra.com/api/public/users/search?q=john&limit=10"
```

**Example Response:**
```json
{
  "success": true,
  "query": "john",
  "results": [
    {
      "id": "uuid",
      "name": "John Doe",
      "avatar_url": "https://...",
      "bio": "Eco warrior",
      "location": "Jakarta",
      "total_points": 1500,
      "level": 5,
      "current_streak": 7,
      "longest_streak": 30,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "total": 42,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## 🏆 Leaderboard

Get top users ranked by points, streak, or level.

**Endpoint:** `GET /api/public/leaderboard`

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `type` | string | No | points | Ranking type: `points`, `streak`, `level` |
| `period` | string | No | all | Time period: `all`, `monthly`, `weekly` |
| `limit` | number | No | 100 | Results limit (max 500) |

**Example Request:**
```bash
curl "https://sso.fooptra.com/api/public/leaderboard?type=points&limit=10"
```

**Example Response:**
```json
{
  "success": true,
  "type": "points",
  "period": "all",
  "leaderboard": [
    {
      "rank": 1,
      "id": "uuid",
      "name": "Top User",
      "avatar_url": "https://...",
      "total_points": 5000,
      "level": 10,
      "current_streak": 45
    }
  ],
  "total": 10,
  "metadata": {
    "generated_at": "2025-01-15T10:00:00Z",
    "cache_duration": 300
  }
}
```

---

## 👤 Get User Profile

Get detailed public profile of a user.

**Endpoint:** `GET /api/public/users/[id]`

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | User ID |

**Example Request:**
```bash
curl "https://sso.fooptra.com/api/public/users/9d957c68-5bc9-49c1-a794-c0cdb394db36"
```

**Example Response:**
```json
{
  "success": true,
  "profile": {
    "id": "uuid",
    "name": "John Doe",
    "avatar_url": "https://...",
    "bio": "Environmental enthusiast",
    "location": "Jakarta, Indonesia",
    "total_points": 1500,
    "level": 5,
    "current_streak": 7,
    "longest_streak": 30,
    "created_at": "2024-01-01T00:00:00Z",
    "privacy": {
      "profile_visible": true,
      "show_on_leaderboard": true
    }
  },
  "statistics": {
    "total_waste_logs": 45,
    "total_waste_quantity": 120.5,
    "achievements_count": 8
  },
  "achievements": [
    {
      "id": "uuid",
      "badge_name": "First Step",
      "badge_type": "bronze",
      "unlocked_at": "2024-01-15T00:00:00Z"
    }
  ],
  "recent_logs": [
    {
      "id": "uuid",
      "category": "Food Waste",
      "quantity": 2.5,
      "date": "2025-01-15",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ]
}
```

**Error Responses:**
- `403` - Profile is private
- `404` - User not found

---

## 📊 Platform Statistics

Get overall platform statistics.

**Endpoint:** `GET /api/public/stats`

**Example Request:**
```bash
curl "https://sso.fooptra.com/api/public/stats"
```

**Example Response:**
```json
{
  "success": true,
  "platform_stats": {
    "total_users": 1250,
    "active_users_30d": 850,
    "total_waste_logs": 15420,
    "total_waste_tracked_kg": 8542.75,
    "total_achievements": 3890
  },
  "top_waste_categories": [
    {
      "category": "Food Waste",
      "quantity": 4521.5
    },
    {
      "category": "Plastic",
      "quantity": 2341.2
    }
  ],
  "metadata": {
    "generated_at": "2025-01-15T10:00:00Z",
    "cache_duration": 300
  }
}
```

---

## 🔐 CORS & Rate Limiting

- **CORS:** All endpoints allow requests from any origin (`*`)
- **Rate Limiting:** Consider implementing rate limiting on your side
- **Caching:** Responses include cache headers. Recommended: 5 minutes

---

## 🚀 Usage in Web App

### JavaScript/TypeScript Example:

```typescript
// Search users
const searchUsers = async (query: string) => {
  const response = await fetch(
    `https://sso.fooptra.com/api/public/users/search?q=${encodeURIComponent(query)}&limit=10`
  );
  const data = await response.json();
  return data;
};

// Get leaderboard
const getLeaderboard = async () => {
  const response = await fetch(
    'https://sso.fooptra.com/api/public/leaderboard?type=points&limit=100'
  );
  const data = await response.json();
  return data;
};

// Get user profile
const getUserProfile = async (userId: string) => {
  const response = await fetch(
    `https://sso.fooptra.com/api/public/users/${userId}`
  );
  const data = await response.json();
  return data;
};

// Get platform stats
const getStats = async () => {
  const response = await fetch(
    'https://sso.fooptra.com/api/public/stats'
  );
  const data = await response.json();
  return data;
};
```

---

## 📝 Notes

- Only **public profiles** (`profile_visible = true`) appear in search results
- Only users who opted-in (`show_on_leaderboard = true`) appear in leaderboards
- Private profiles return `403 Forbidden` when accessed directly
- All timestamps are in ISO 8601 format (UTC)
- Responses are cached for 5 minutes (recommended)

---

## ⚠️ Privacy & Security

Users can control their visibility in **Settings > Privacy**:
- `profile_visible` - Show profile to public
- `show_on_leaderboard` - Appear in leaderboards

Only public data is exposed through these APIs.
