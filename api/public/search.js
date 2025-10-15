const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  // CORS headers - Allow from anywhere
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { q, limit = 10, offset = 0 } = req.query;

    if (!q || q.trim() === '') {
      return res.status(400).json({ 
        error: 'Search query parameter "q" is required',
        example: '/api/public/users/search?q=john&limit=10&offset=0'
      });
    }

    const searchQuery = q.trim();
    const limitNum = Math.min(parseInt(limit) || 10, 50); // Max 50
    const offsetNum = parseInt(offset) || 0;

    // Search users by name (case insensitive)
    // Only return public profiles
    const { data, error, count } = await supabase
      .from('profiles')
      .select(`
        id,
        name,
        avatar_url,
        bio,
        location,
        total_points,
        level,
        current_streak,
        longest_streak,
        created_at
      `, { count: 'exact' })
      .ilike('name', `%${searchQuery}%`)
      .eq('settings->privacy->>profile_visible', true) // Only visible profiles
      .order('total_points', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (error) {
      console.error('Search error:', error);
      return res.status(500).json({ error: 'Failed to search users' });
    }

    return res.status(200).json({
      success: true,
      query: searchQuery,
      results: data || [],
      pagination: {
        total: count || 0,
        limit: limitNum,
        offset: offsetNum,
        hasMore: (count || 0) > offsetNum + limitNum
      }
    });

  } catch (error) {
    console.error('Search users error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};