-- ============================================================
-- D1: Top 10 most active users in the last 7 days
-- Ranked by total interactions (views + replies + reactions)
-- ============================================================
SELECT
    u.id AS user_id,
    u.name,
    (COALESCE(v.total_views, 0) + COALESCE(r.total_replies, 0) + COALESCE(rc.total_reactions, 0)) AS total_interactions
FROM users u
LEFT JOIN (
    SELECT user_id, COUNT(*) AS total_views
    FROM post_views
    WHERE viewed_at >= NOW() - INTERVAL '7 days'
    GROUP BY user_id
) v ON v.user_id = u.id
LEFT JOIN (
    SELECT user_id, COUNT(*) AS total_replies
    FROM replies
    WHERE created_at >= NOW() - INTERVAL '7 days'
    GROUP BY user_id
) r ON r.user_id = u.id
LEFT JOIN (
    SELECT user_id, COUNT(*) AS total_reactions
    FROM reactions
    WHERE created_at >= NOW() - INTERVAL '7 days'
    GROUP BY user_id
) rc ON rc.user_id = u.id
ORDER BY total_interactions DESC
LIMIT 10;

-- ============================================================
-- D2: Posts from top-interacted authors for a given user
-- Uses a CTE to rank authors by interaction count (excluding self),
-- then returns their posts from the last 30 days
-- ============================================================
WITH author_rank AS (
    SELECT
        i.target_user_id AS author_id,
        COUNT(*) AS interaction_count
    FROM interactions i
    WHERE i.user_id = :user_id
      AND i.target_user_id != i.user_id
    GROUP BY i.target_user_id
    ORDER BY interaction_count DESC
)
SELECT
    p.id AS post_id,
    p.user_id AS author_id,
    p.content,
    p.created_at
FROM posts p
INNER JOIN author_rank ar ON ar.author_id = p.user_id
WHERE p.created_at >= NOW() - INTERVAL '30 days'
ORDER BY ar.interaction_count DESC, p.created_at DESC;

-- ============================================================
-- D3: Posts viewed more than 100 times with zero reactions
-- ============================================================
SELECT
    p.id AS post_id,
    p.user_id AS author_id,
    pv.view_count,
    p.created_at
FROM posts p
INNER JOIN (
    SELECT post_id, COUNT(*) AS view_count
    FROM post_views
    GROUP BY post_id
    HAVING COUNT(*) > 100
) pv ON pv.post_id = p.id
LEFT JOIN reactions r ON r.post_id = p.id
WHERE r.id IS NULL
ORDER BY pv.view_count DESC;

-- ============================================================
-- D4: Spam detection — users with >20 posts in the last 24 hours
-- ============================================================
SELECT
    u.id AS user_id,
    u.name,
    u.email,
    post_count
FROM (
    SELECT
        user_id,
        COUNT(*) AS post_count
    FROM posts
    WHERE created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY user_id
    HAVING COUNT(*) > 20
) p
INNER JOIN users u ON u.id = p.user_id
ORDER BY post_count DESC;
