const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      type = 'points', // points, streak, level
      period = 'all', // all, monthly, weekly
      limit = 100 
    } = req.query;

    const limitNum = Math.min(parseInt(limit) || 100, 500); // Max 500

    // Determine sort field
    let orderBy = 'total_points';
    if (type === 'streak') {
      orderBy = 'current_streak';
    } else if (type === 'level') {
      orderBy = 'level';
    }

    // Build query
    let query = supabase
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
      `)
      .eq('settings->privacy->>show_on_leaderboard', true) // Only users who opt-in
      .order(orderBy, { ascending: false })
      .order('created_at', { ascending: true }) // Tiebreaker
      .limit(limitNum);

    // Period filter (if applicable)
    if (period === 'monthly') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      query = query.gte('created_at', thirtyDaysAgo.toISOString());
    } else if (period === 'weekly') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      query = query.gte('created_at', sevenDaysAgo.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('Leaderboard error:', error);
      return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }

    // Add rank to each user
    const leaderboard = (data || []).map((user, index) => ({
      rank: index + 1,
      ...user
    }));

    return res.status(200).json({
      success: true,
      type,
      period,
      leaderboard,
      total: leaderboard.length,
      metadata: {
        generated_at: new Date().toISOString(),
        cache_duration: 300 // Suggest 5 min cache
      }
    });

  } catch (error) {
    console.error('Leaderboard error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};