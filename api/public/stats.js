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
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); // Cache 5 min

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get total users
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    // Get total waste logs
    const { count: totalLogs } = await supabase
      .from('waste_logs')
      .select('*', { count: 'exact', head: true });

    // Get total waste quantity
    const { data: wasteLogs } = await supabase
      .from('waste_logs')
      .select('quantity');

    const totalWasteTracked = wasteLogs?.reduce((sum, log) => sum + log.quantity, 0) || 0;

    // Get total achievements unlocked
    const { count: totalAchievements } = await supabase
      .from('achievements')
      .select('*', { count: 'exact', head: true });

    // Get active users (logged in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count: activeUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('updated_at', thirtyDaysAgo.toISOString());

    // Get top categories
    const { data: categoryData } = await supabase
      .from('waste_logs')
      .select('category, quantity');

    const categoryStats = {};
    categoryData?.forEach(log => {
      if (!categoryStats[log.category]) {
        categoryStats[log.category] = 0;
      }
      categoryStats[log.category] += log.quantity;
    });

    const topCategories = Object.entries(categoryStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, quantity]) => ({ category, quantity }));

    return res.status(200).json({
      success: true,
      platform_stats: {
        total_users: totalUsers || 0,
        active_users_30d: activeUsers || 0,
        total_waste_logs: totalLogs || 0,
        total_waste_tracked_kg: Math.round(totalWasteTracked * 100) / 100,
        total_achievements: totalAchievements || 0,
      },
      top_waste_categories: topCategories,
      metadata: {
        generated_at: new Date().toISOString(),
        cache_duration: 300
      }
    });

  } catch (error) {
    console.error('Platform stats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};