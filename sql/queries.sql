-- ============================================================
-- D1: Top 10 most active users in the last 7 days
-- Ranked by total interactions (views + replies + reactions)
-- ============================================================
SELECT
    u.id AS user_id,
    u.name,
    COUNT(*) AS total_interactions
FROM users u
INNER JOIN interactions i ON i.user_id = u.id
WHERE i.created_at >= NOW() - INTERVAL '7 days'
GROUP BY u.id, u.name
ORDER BY total_interactions DESC
LIMIT 10;

-- ============================================================
-- D2: For a given user_id, return posts from users they interact
-- with most, ordered by interaction frequency descending, limited
-- to posts from the last 30 days.
-- ============================================================
WITH author_rank AS (
    SELECT
        p.user_id AS author_id,
        COUNT(*) AS interaction_count
    FROM interactions i
    INNER JOIN posts p ON p.id = i.post_id
    WHERE i.user_id = :user_id
      AND p.user_id != i.user_id
    GROUP BY p.user_id
)
SELECT
    p.id AS post_id,
    p.user_id AS author_id,
    p.body,
    p.created_at
FROM posts p
INNER JOIN author_rank ar ON ar.author_id = p.user_id
WHERE p.created_at >= NOW() - INTERVAL '30 days'
ORDER BY ar.interaction_count DESC, p.created_at DESC;

-- ============================================================
-- D3: Find posts that have been viewed more than 100 times
-- but have zero reactions. Return post_id, author_id, view_count,
-- and created_at.
-- ============================================================
SELECT
    p.id AS post_id,
    p.user_id AS author_id,
    pv.view_count,
    p.created_at
FROM posts p
INNER JOIN (
    SELECT post_id, COUNT(*) AS view_count
    FROM interactions
    WHERE type = 'view'
    GROUP BY post_id
    HAVING COUNT(*) > 100
) pv ON pv.post_id = p.id
LEFT JOIN interactions r ON r.post_id = p.id AND r.type = 'reaction'
WHERE r.id IS NULL
ORDER BY pv.view_count DESC;

-- ============================================================
-- D4: Spam detection — users who have created more than 20
-- posts in the last 24 hours. Include their email and post count.
-- ============================================================
SELECT
    u.id AS user_id,
    u.name,
    u.email,
    p.post_count
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
ORDER BY p.post_count DESC;
