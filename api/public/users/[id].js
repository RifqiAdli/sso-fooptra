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
    const { id } = req.query;

    // Validate user ID
    if (!id) {
      return res.status(400).json({ 
        error: 'User ID is required',
        example: '/api/public/users/[user-id]'
      });
    }

    // Validate UUID format (if using UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ 
        error: 'Invalid user ID format' 
      });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
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
        created_at,
        settings
      `)
      .eq('id', id)
      .single();

    if (profileError) {
      if (profileError.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('Profile error:', profileError);
      return res.status(500).json({ 
        error: 'Failed to fetch profile',
        details: process.env.NODE_ENV === 'development' ? profileError.message : undefined
      });
    }

    // Safe access to nested settings
    const isProfileVisible = profile?.settings?.privacy?.profile_visible ?? false;
    const showOnLeaderboard = profile?.settings?.privacy?.show_on_leaderboard ?? false;

    // Check if profile is public
    if (!isProfileVisible) {
      return res.status(403).json({ 
        error: 'This profile is private' 
      });
    }

    // Get user achievements (with error handling)
    const { data: achievements, error: achievementsError } = await supabase
      .from('achievements')
      .select('id, badge_name, badge_type, unlocked_at')
      .eq('user_id', id)
      .order('unlocked_at', { ascending: false })
      .limit(10);

    if (achievementsError) {
      console.error('Achievements error:', achievementsError);
    }

    // Get recent waste logs (with error handling)
    const { data: recentLogs, error: logsError } = await supabase
      .from('waste_logs')
      .select('id, category, quantity, date, created_at')
      .eq('user_id', id)
      .order('date', { ascending: false })
      .limit(5);

    if (logsError) {
      console.error('Recent logs error:', logsError);
    }

    // Calculate statistics
    const { data: stats, error: statsError } = await supabase
      .from('waste_logs')
      .select('quantity, category')
      .eq('user_id', id);

    if (statsError) {
      console.error('Stats error:', statsError);
    }

    const totalWasteLogs = stats?.length || 0;
    const totalWasteQuantity = stats?.reduce((sum, log) => {
      const quantity = parseFloat(log.quantity) || 0;
      return sum + quantity;
    }, 0) || 0;

    // Remove sensitive settings before returning
    const { settings, ...publicProfile } = profile;

    return res.status(200).json({
      success: true,
      profile: {
        ...publicProfile,
        privacy: {
          profile_visible: isProfileVisible,
          show_on_leaderboard: showOnLeaderboard
        }
      },
      statistics: {
        total_waste_logs: totalWasteLogs,
        total_waste_quantity: parseFloat(totalWasteQuantity.toFixed(2)),
        achievements_count: achievements?.length || 0
      },
      achievements: achievements || [],
      recent_logs: recentLogs || []
    });

  } catch (error) {
    console.error('Get user profile error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};