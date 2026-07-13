-- ============================================================================
-- D1: Top 10 most active users in the last 7 days, ranked by total
--     interactions (views + replies + reactions)
-- ============================================================================
SELECT
    u.id AS user_id,
    u.name,
    COUNT(i.id) AS total_interactions
FROM users u
JOIN interactions i ON i.user_id = u.id
WHERE i.created_at > NOW() - INTERVAL '7 days'
GROUP BY u.id, u.name
ORDER BY total_interactions DESC
LIMIT 10;


-- ============================================================================
-- D2: For a given user_id, return all posts from users they interact with
--     most, ordered by interaction frequency descending, limited to posts
--     from the last 30 days.
--
-- Two-step logic: first rank which authors :user_id interacts with most,
-- then pull that author's recent posts, carrying the frequency rank through
-- so the final ORDER BY is by "how much I interact with this author", not by
-- post recency.
-- ============================================================================
WITH author_interaction_counts AS (
    SELECT
        p.user_id AS author_id,
        COUNT(*) AS interaction_count
    FROM interactions i
    JOIN posts p ON p.id = i.post_id
    WHERE i.user_id = :user_id       -- bind parameter
      AND p.user_id != :user_id      -- exclude self-interactions
    GROUP BY p.user_id
)
SELECT
    posts.id AS post_id,
    posts.user_id AS author_id,
    posts.body,
    posts.created_at,
    aic.interaction_count
FROM posts
JOIN author_interaction_counts aic ON aic.author_id = posts.user_id
WHERE posts.created_at > NOW() - INTERVAL '30 days'
ORDER BY aic.interaction_count DESC, posts.created_at DESC;


-- ============================================================================
-- D3: Posts viewed more than 100 times but with zero reactions.
--     Return post_id, author_id, view_count, created_at.
-- ============================================================================
SELECT
    p.id AS post_id,
    p.user_id AS author_id,
    COUNT(*) FILTER (WHERE i.type = 'view') AS view_count,
    p.created_at
FROM posts p
JOIN interactions i ON i.post_id = p.id
GROUP BY p.id, p.user_id, p.created_at
HAVING
    COUNT(*) FILTER (WHERE i.type = 'view') > 100
    AND COUNT(*) FILTER (WHERE i.type = 'reaction') = 0;


-- ============================================================================
-- D4: Spam detection — users who created more than 20 posts in the last
--     24 hours. Include their email and post count.
-- ============================================================================
SELECT
    u.id AS user_id,
    u.email,
    COUNT(p.id) AS post_count_last_24h
FROM users u
JOIN posts p ON p.user_id = u.id
WHERE p.created_at > NOW() - INTERVAL '24 hours'
GROUP BY u.id, u.email
HAVING COUNT(p.id) > 20
ORDER BY post_count_last_24h DESC;
