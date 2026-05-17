-- =============================================================
-- Dashboard Sample Data Seed
-- PostgreSQL · run with: psql $DATABASE_URL -f seed-dashboard.sql
-- =============================================================

-- Create the role enum if it doesn't exist yet
-- (TypeORM synchronize should have done this already; safe to skip if it errors)
DO $$ BEGIN
    CREATE TYPE users_role_enum AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- USERS  (60 registrations spread across the last 30 days)
-- ─────────────────────────────────────────────────────────────
INSERT INTO users (
    id, email, username, password,
    "firstName", "lastName", role,
    "isActive", "isEmailVerified",
    "createdAt", "updatedAt"
) VALUES
  (gen_random_uuid(), 'alice@example.com',   'alice',    '$2b$10$placeholder', 'Alice',   'Nguyen',  'user',  true,  true,  NOW() - INTERVAL '30 days', NOW()),
  (gen_random_uuid(), 'bob@example.com',     'bob',      '$2b$10$placeholder', 'Bob',     'Tran',    'user',  true,  true,  NOW() - INTERVAL '29 days', NOW()),
  (gen_random_uuid(), 'carol@example.com',   'carol',    '$2b$10$placeholder', 'Carol',   'Le',      'user',  true,  false, NOW() - INTERVAL '28 days', NOW()),
  (gen_random_uuid(), 'dave@example.com',    'dave',     '$2b$10$placeholder', 'Dave',    'Pham',    'user',  true,  true,  NOW() - INTERVAL '28 days', NOW()),
  (gen_random_uuid(), 'eve@example.com',     'eve',      '$2b$10$placeholder', 'Eve',     'Hoang',   'user',  true,  true,  NOW() - INTERVAL '27 days', NOW()),
  (gen_random_uuid(), 'frank@example.com',   'frank',    '$2b$10$placeholder', 'Frank',   'Vu',      'user',  false, false, NOW() - INTERVAL '27 days', NOW()),
  (gen_random_uuid(), 'grace@example.com',   'grace',    '$2b$10$placeholder', 'Grace',   'Do',      'user',  true,  true,  NOW() - INTERVAL '26 days', NOW()),
  (gen_random_uuid(), 'henry@example.com',   'henry',    '$2b$10$placeholder', 'Henry',   'Bui',     'user',  true,  true,  NOW() - INTERVAL '25 days', NOW()),
  (gen_random_uuid(), 'iris@example.com',    'iris',     '$2b$10$placeholder', 'Iris',    'Dang',    'user',  true,  false, NOW() - INTERVAL '25 days', NOW()),
  (gen_random_uuid(), 'jack@example.com',    'jack',     '$2b$10$placeholder', 'Jack',    'Ngo',     'user',  true,  true,  NOW() - INTERVAL '24 days', NOW()),
  (gen_random_uuid(), 'kate@example.com',    'kate',     '$2b$10$placeholder', 'Kate',    'Ly',      'user',  true,  true,  NOW() - INTERVAL '24 days', NOW()),
  (gen_random_uuid(), 'leo@example.com',     'leo',      '$2b$10$placeholder', 'Leo',     'Truong',  'user',  true,  true,  NOW() - INTERVAL '23 days', NOW()),
  (gen_random_uuid(), 'mia@example.com',     'mia',      '$2b$10$placeholder', 'Mia',     'Dinh',    'user',  true,  false, NOW() - INTERVAL '23 days', NOW()),
  (gen_random_uuid(), 'nick@example.com',    'nick',     '$2b$10$placeholder', 'Nick',    'Cao',     'user',  true,  true,  NOW() - INTERVAL '22 days', NOW()),
  (gen_random_uuid(), 'olivia@example.com',  'olivia',   '$2b$10$placeholder', 'Olivia',  'Ha',      'user',  true,  true,  NOW() - INTERVAL '22 days', NOW()),
  (gen_random_uuid(), 'paul@example.com',    'paul',     '$2b$10$placeholder', 'Paul',    'Mai',     'user',  true,  true,  NOW() - INTERVAL '21 days', NOW()),
  (gen_random_uuid(), 'quinn@example.com',   'quinn',    '$2b$10$placeholder', 'Quinn',   'Vo',      'user',  true,  false, NOW() - INTERVAL '21 days', NOW()),
  (gen_random_uuid(), 'rose@example.com',    'rose',     '$2b$10$placeholder', 'Rose',    'Phan',    'user',  false, false, NOW() - INTERVAL '20 days', NOW()),
  (gen_random_uuid(), 'sam@example.com',     'sam',      '$2b$10$placeholder', 'Sam',     'Trinh',   'user',  true,  true,  NOW() - INTERVAL '20 days', NOW()),
  (gen_random_uuid(), 'tina@example.com',    'tina',     '$2b$10$placeholder', 'Tina',    'Luu',     'user',  true,  true,  NOW() - INTERVAL '19 days', NOW()),
  (gen_random_uuid(), 'uma@example.com',     'uma',      '$2b$10$placeholder', 'Uma',     'Chu',     'user',  true,  true,  NOW() - INTERVAL '19 days', NOW()),
  (gen_random_uuid(), 'victor@example.com',  'victor',   '$2b$10$placeholder', 'Victor',  'Duong',   'user',  true,  true,  NOW() - INTERVAL '18 days', NOW()),
  (gen_random_uuid(), 'wendy@example.com',   'wendy',    '$2b$10$placeholder', 'Wendy',   'Tong',    'user',  true,  false, NOW() - INTERVAL '18 days', NOW()),
  (gen_random_uuid(), 'xander@example.com',  'xander',   '$2b$10$placeholder', 'Xander',  'Bach',    'user',  true,  true,  NOW() - INTERVAL '17 days', NOW()),
  (gen_random_uuid(), 'yara@example.com',    'yara',     '$2b$10$placeholder', 'Yara',    'Lam',     'user',  true,  true,  NOW() - INTERVAL '16 days', NOW()),
  (gen_random_uuid(), 'zoe@example.com',     'zoe',      '$2b$10$placeholder', 'Zoe',     'Huynh',   'user',  true,  true,  NOW() - INTERVAL '16 days', NOW()),
  (gen_random_uuid(), 'aaron@example.com',   'aaron',    '$2b$10$placeholder', 'Aaron',   'Quach',   'user',  true,  true,  NOW() - INTERVAL '15 days', NOW()),
  (gen_random_uuid(), 'bella@example.com',   'bella',    '$2b$10$placeholder', 'Bella',   'Thi',     'user',  true,  false, NOW() - INTERVAL '15 days', NOW()),
  (gen_random_uuid(), 'chris@example.com',   'chris',    '$2b$10$placeholder', 'Chris',   'Minh',    'user',  true,  true,  NOW() - INTERVAL '14 days', NOW()),
  (gen_random_uuid(), 'diana@example.com',   'diana',    '$2b$10$placeholder', 'Diana',   'Duc',     'user',  true,  true,  NOW() - INTERVAL '14 days', NOW()),
  (gen_random_uuid(), 'ethan@example.com',   'ethan',    '$2b$10$placeholder', 'Ethan',   'Son',     'user',  true,  true,  NOW() - INTERVAL '13 days', NOW()),
  (gen_random_uuid(), 'fiona@example.com',   'fiona',    '$2b$10$placeholder', 'Fiona',   'Nam',     'user',  false, false, NOW() - INTERVAL '13 days', NOW()),
  (gen_random_uuid(), 'george@example.com',  'george',   '$2b$10$placeholder', 'George',  'Hung',    'user',  true,  true,  NOW() - INTERVAL '12 days', NOW()),
  (gen_random_uuid(), 'hannah@example.com',  'hannah',   '$2b$10$placeholder', 'Hannah',  'Khanh',   'user',  true,  true,  NOW() - INTERVAL '12 days', NOW()),
  (gen_random_uuid(), 'ian@example.com',     'ian',      '$2b$10$placeholder', 'Ian',     'Tuyen',   'user',  true,  false, NOW() - INTERVAL '11 days', NOW()),
  (gen_random_uuid(), 'julia@example.com',   'julia',    '$2b$10$placeholder', 'Julia',   'Thao',    'user',  true,  true,  NOW() - INTERVAL '11 days', NOW()),
  (gen_random_uuid(), 'kevin@example.com',   'kevin',    '$2b$10$placeholder', 'Kevin',   'Giang',   'user',  true,  true,  NOW() - INTERVAL '10 days', NOW()),
  (gen_random_uuid(), 'lena@example.com',    'lena',     '$2b$10$placeholder', 'Lena',    'Huong',   'user',  true,  true,  NOW() - INTERVAL '10 days', NOW()),
  (gen_random_uuid(), 'mike@example.com',    'mike',     '$2b$10$placeholder', 'Mike',    'Thanh',   'user',  true,  true,  NOW() - INTERVAL '9 days',  NOW()),
  (gen_random_uuid(), 'nina@example.com',    'nina',     '$2b$10$placeholder', 'Nina',    'Xuan',    'user',  true,  false, NOW() - INTERVAL '9 days',  NOW()),
  (gen_random_uuid(), 'oscar@example.com',   'oscar',    '$2b$10$placeholder', 'Oscar',   'Hieu',    'user',  true,  true,  NOW() - INTERVAL '8 days',  NOW()),
  (gen_random_uuid(), 'penny@example.com',   'penny',    '$2b$10$placeholder', 'Penny',   'Long',    'user',  true,  true,  NOW() - INTERVAL '8 days',  NOW()),
  (gen_random_uuid(), 'ray@example.com',     'ray',      '$2b$10$placeholder', 'Ray',     'Phong',   'user',  true,  true,  NOW() - INTERVAL '7 days',  NOW()),
  (gen_random_uuid(), 'sara@example.com',    'sara',     '$2b$10$placeholder', 'Sara',    'Quang',   'user',  true,  true,  NOW() - INTERVAL '7 days',  NOW()),
  (gen_random_uuid(), 'tom@example.com',     'tom',      '$2b$10$placeholder', 'Tom',     'Binh',    'user',  true,  false, NOW() - INTERVAL '6 days',  NOW()),
  (gen_random_uuid(), 'una@example.com',     'una',      '$2b$10$placeholder', 'Una',     'Linh',    'user',  true,  true,  NOW() - INTERVAL '6 days',  NOW()),
  (gen_random_uuid(), 'vince@example.com',   'vince',    '$2b$10$placeholder', 'Vince',   'Tuan',    'user',  true,  true,  NOW() - INTERVAL '5 days',  NOW()),
  (gen_random_uuid(), 'willa@example.com',   'willa',    '$2b$10$placeholder', 'Willa',   'Cuong',   'user',  true,  true,  NOW() - INTERVAL '5 days',  NOW()),
  (gen_random_uuid(), 'xena@example.com',    'xena',     '$2b$10$placeholder', 'Xena',    'Dat',     'user',  false, false, NOW() - INTERVAL '4 days',  NOW()),
  (gen_random_uuid(), 'yogi@example.com',    'yogi',     '$2b$10$placeholder', 'Yogi',    'Tam',     'user',  true,  true,  NOW() - INTERVAL '4 days',  NOW()),
  (gen_random_uuid(), 'zack@example.com',    'zack',     '$2b$10$placeholder', 'Zack',    'Sang',    'user',  true,  true,  NOW() - INTERVAL '3 days',  NOW()),
  (gen_random_uuid(), 'amy@example.com',     'amy',      '$2b$10$placeholder', 'Amy',     'Khoa',    'user',  true,  true,  NOW() - INTERVAL '3 days',  NOW()),
  (gen_random_uuid(), 'brad@example.com',    'brad',     '$2b$10$placeholder', 'Brad',    'Loi',     'user',  true,  false, NOW() - INTERVAL '2 days',  NOW()),
  (gen_random_uuid(), 'cleo@example.com',    'cleo',     '$2b$10$placeholder', 'Cleo',    'Nhu',     'user',  true,  true,  NOW() - INTERVAL '2 days',  NOW()),
  (gen_random_uuid(), 'dean@example.com',    'dean',     '$2b$10$placeholder', 'Dean',    'Viet',    'user',  true,  true,  NOW() - INTERVAL '1 day',   NOW()),
  (gen_random_uuid(), 'ella@example.com',    'ella',     '$2b$10$placeholder', 'Ella',    'Hoa',     'user',  true,  true,  NOW() - INTERVAL '1 day',   NOW()),
  (gen_random_uuid(), 'finn@example.com',    'finn',     '$2b$10$placeholder', 'Finn',    'Bao',     'user',  true,  true,  NOW() - INTERVAL '12 hours',NOW()),
  (gen_random_uuid(), 'gina@example.com',    'gina',     '$2b$10$placeholder', 'Gina',    'Anh',     'user',  true,  false, NOW() - INTERVAL '6 hours', NOW()),
  (gen_random_uuid(), 'hugo@example.com',    'hugo',     '$2b$10$placeholder', 'Hugo',    'Kien',    'user',  true,  true,  NOW() - INTERVAL '2 hours', NOW()),
  (gen_random_uuid(), 'ida@example.com',     'ida',      '$2b$10$placeholder', 'Ida',     'Thu',     'user',  true,  true,  NOW() - INTERVAL '30 mins', NOW())
ON CONFLICT (email) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- SWAP EXECUTIONS  (120 swaps over the last 30 days)
-- Token mints (real Solana addresses):
--   SOL  = So11111111111111111111111111111111111111112
--   USDC = EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
--   BONK = DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263
--   JTO  = jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL
--   WIF  = EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm
--   RAY  = 4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R
-- ─────────────────────────────────────────────────────────────
INSERT INTO swap_executions (
    id, "userId", "walletAddress", signature,
    "inputMint", "outputMint",
    "inAmount", "outAmount", "volumeUsd", "createdAt"
) VALUES
-- Day -30
  (gen_random_uuid(), NULL, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sig001aaa', 'So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 2000000000, 450000000,  450.00, NOW() - INTERVAL '30 days'),
  (gen_random_uuid(), NULL, 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'sig001bbb', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'So11111111111111111111111111111111111111112', 1000000000, 4400000,    1000.00, NOW() - INTERVAL '30 days'),
-- Day -28
  (gen_random_uuid(), NULL, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sig002aaa', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 50000000000, 125000000, 125.00, NOW() - INTERVAL '28 days'),
  (gen_random_uuid(), NULL, 'CzumNEBHuFzBifJHEWhpzSRMbCDqMGxtKtPSUBQJGv7m', 'sig002bbb', 'So11111111111111111111111111111111111111112', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 5000000000,  12500000000, 1100.00, NOW() - INTERVAL '28 days'),
  (gen_random_uuid(), NULL, 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'sig002ccc', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 800000000,   320000000,  320.00, NOW() - INTERVAL '28 days'),
-- Day -26
  (gen_random_uuid(), NULL, '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWm', 'sig003aaa', 'So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 1000000000, 225000000,  225.00, NOW() - INTERVAL '26 days'),
  (gen_random_uuid(), NULL, 'EPHKPvFqMjczRHyDstUcxGzmUTqehz1iqPzSGCiuNpqS', 'sig003bbb', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 2000000000, 580000000, 580.00, NOW() - INTERVAL '26 days'),
-- Day -25
  (gen_random_uuid(), NULL, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sig004aaa', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', 500000000, 1250000000, 500.00, NOW() - INTERVAL '25 days'),
  (gen_random_uuid(), NULL, 'CzumNEBHuFzBifJHEWhpzSRMbCDqMGxtKtPSUBQJGv7m', 'sig004bbb', 'So11111111111111111111111111111111111111112', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  3000000000, 1200000000, 660.00, NOW() - INTERVAL '25 days'),
  (gen_random_uuid(), NULL, 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'sig004ccc', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'So11111111111111111111111111111111111111112', 80000000000, 900000000, 180.00, NOW() - INTERVAL '25 days'),
-- Day -23
  (gen_random_uuid(), NULL, '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWm', 'sig005aaa', 'So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 4000000000, 900000000,  900.00, NOW() - INTERVAL '23 days'),
  (gen_random_uuid(), NULL, 'EPHKPvFqMjczRHyDstUcxGzmUTqehz1iqPzSGCiuNpqS', 'sig005bbb', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 'So11111111111111111111111111111111111111112', 1500000000, 6600000,   330.00, NOW() - INTERVAL '23 days'),
  (gen_random_uuid(), NULL, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sig005ccc', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 600000000, 240000000000, 240.00, NOW() - INTERVAL '23 days'),
-- Day -21
  (gen_random_uuid(), NULL, 'CzumNEBHuFzBifJHEWhpzSRMbCDqMGxtKtPSUBQJGv7m', 'sig006aaa', 'So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 2500000000, 562500000,  562.50, NOW() - INTERVAL '21 days'),
  (gen_random_uuid(), NULL, 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'sig006bbb', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 2000000000, 8000000000000, 2000.00, NOW() - INTERVAL '21 days'),
  (gen_random_uuid(), NULL, '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWm', 'sig006ccc', '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 3000000000, 960000000,  960.00, NOW() - INTERVAL '21 days'),
-- Day -19
  (gen_random_uuid(), NULL, 'EPHKPvFqMjczRHyDstUcxGzmUTqehz1iqPzSGCiuNpqS', 'sig007aaa', 'So11111111111111111111111111111111111111112', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  1000000000, 400000000,  220.00, NOW() - INTERVAL '19 days'),
  (gen_random_uuid(), NULL, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sig007bbb', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'So11111111111111111111111111111111111111112', 10000000000, 440000,    100.00, NOW() - INTERVAL '19 days'),
  (gen_random_uuid(), NULL, 'CzumNEBHuFzBifJHEWhpzSRMbCDqMGxtKtPSUBQJGv7m', 'sig007ccc', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 750000000, 2500000000, 750.00, NOW() - INTERVAL '19 days'),
  (gen_random_uuid(), NULL, 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'sig007ddd', 'So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 6000000000, 1350000000, 1350.00, NOW() - INTERVAL '19 days'),
-- Day -17
  (gen_random_uuid(), NULL, '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWm', 'sig008aaa', 'So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 3000000000, 675000000,  675.00, NOW() - INTERVAL '17 days'),
  (gen_random_uuid(), NULL, 'EPHKPvFqMjczRHyDstUcxGzmUTqehz1iqPzSGCiuNpqS', 'sig008bbb', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 1200000000, 480000000, 480.00, NOW() - INTERVAL '17 days'),
  (gen_random_uuid(), NULL, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sig008ccc', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 'So11111111111111111111111111111111111111112', 5000000000, 22000000,   1100.00, NOW() - INTERVAL '17 days'),
-- Day -15
  (gen_random_uuid(), NULL, 'CzumNEBHuFzBifJHEWhpzSRMbCDqMGxtKtPSUBQJGv7m', 'sig009aaa', 'So11111111111111111111111111111111111111112', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 1500000000, 37500000000, 337.50, NOW() - INTERVAL '15 days'),
  (gen_random_uuid(), NULL, 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'sig009bbb', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'So11111111111111111111111111111111111111112', 3000000000, 13200000,  3000.00, NOW() - INTERVAL '15 days'),
  (gen_random_uuid(), NULL, '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWm', 'sig009ccc', '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 2000000000, 640000000, 640.00, NOW() - INTERVAL '15 days'),
  (gen_random_uuid(), NULL, 'EPHKPvFqMjczRHyDstUcxGzmUTqehz1iqPzSGCiuNpqS', 'sig009ddd', 'So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 8000000000, 1800000000, 1800.00, NOW() - INTERVAL '15 days'),
  (gen_random_uuid(), NULL, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sig009eee', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  60000000000, 600000000, 600.00, NOW() - INTERVAL '15 days'),
-- Day -13
  (gen_random_uuid(), NULL, 'CzumNEBHuFzBifJHEWhpzSRMbCDqMGxtKtPSUBQJGv7m', 'sig010aaa', 'So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 5000000000, 1125000000, 1125.00, NOW() - INTERVAL '13 days'),
  (gen_random_uuid(), NULL, 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'sig010bbb', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 900000000,  270000000,  270.00, NOW() - INTERVAL '13 days'),
  (gen_random_uuid(), NULL, '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWm', 'sig010ccc', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  'So11111111111111111111111111111111111111112', 2000000000, 8800000,   440.00, NOW() - INTERVAL '13 days'),
  (gen_random_uuid(), NULL, 'EPHKPvFqMjczRHyDstUcxGzmUTqehz1iqPzSGCiuNpqS', 'sig010ddd', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', 1500000000, 3750000000, 1500.00, NOW() - INTERVAL '13 days'),
-- Day -11
  (gen_random_uuid(), NULL, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sig011aaa', 'So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 7000000000, 1575000000, 1575.00, NOW() - INTERVAL '11 days'),
  (gen_random_uuid(), NULL, 'CzumNEBHuFzBifJHEWhpzSRMbCDqMGxtKtPSUBQJGv7m', 'sig011bbb', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 200000000000, 500000000, 500.00, NOW() - INTERVAL '11 days'),
  (gen_random_uuid(), NULL, 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'sig011ccc', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  400000000, 160000000,  80.00,  NOW() - INTERVAL '11 days'),
  (gen_random_uuid(), NULL, '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWm', 'sig011ddd', 'So11111111111111111111111111111111111111112', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 2000000000, 50000000000, 450.00, NOW() - INTERVAL '11 days'),
  (gen_random_uuid(), NULL, 'EPHKPvFqMjczRHyDstUcxGzmUTqehz1iqPzSGCiuNpqS', 'sig011eee', '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', 'So11111111111111111111111111111111111111112', 5000000000, 22000000,   1100.00, NOW() - INTERVAL '11 days'),
-- Day -9
  (gen_random_uuid(), NULL, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sig012aaa', 'So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 10000000000, 2250000000, 2250.00, NOW() - INTERVAL '9 days'),
  (gen_random_uuid(), NULL, 'CzumNEBHuFzBifJHEWhpzSRMbCDqMGxtKtPSUBQJGv7m', 'sig012bbb', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 800000000, 320000000000, 320.00, NOW() - INTERVAL '9 days'),
  (gen_random_uuid(), NULL, 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'sig012ccc', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'So11111111111111111111111111111111111111112', 5000000000, 22000000,  5000.00, NOW() - INTERVAL '9 days'),
  (gen_random_uuid(), NULL, '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWm', 'sig012ddd', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 3000000000, 900000000, 900.00, NOW() - INTERVAL '9 days'),
  (gen_random_uuid(), NULL, 'EPHKPvFqMjczRHyDstUcxGzmUTqehz1iqPzSGCiuNpqS', 'sig012eee', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'So11111111111111111111111111111111111111112', 150000000000, 660000,   150.00, NOW() - INTERVAL '9 days'),
-- Day -7
  (gen_random_uuid(), NULL, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sig013aaa', 'So11111111111111111111111111111111111111112', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  4000000000, 1600000000, 880.00, NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), NULL, 'CzumNEBHuFzBifJHEWhpzSRMbCDqMGxtKtPSUBQJGv7m', 'sig013bbb', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 2000000000, 6666666666, 2000.00, NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), NULL, 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'sig013ccc', '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 4000000000, 1280000000, 1280.00, NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), NULL, '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWm', 'sig013ddd', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'So11111111111111111111111111111111111111112', 500000000000, 2200000,   500.00, NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), NULL, 'EPHKPvFqMjczRHyDstUcxGzmUTqehz1iqPzSGCiuNpqS', 'sig013eee', 'So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 15000000000, 3375000000, 3375.00, NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), NULL, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sig013fff', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 1000000000, 400000000000, 400.00, NOW() - INTERVAL '7 days'),
-- Day -5
  (gen_random_uuid(), NULL, 'CzumNEBHuFzBifJHEWhpzSRMbCDqMGxtKtPSUBQJGv7m', 'sig014aaa', 'So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 20000000000, 4500000000, 4500.00, NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), NULL, 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'sig014bbb', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  'So11111111111111111111111111111111111111112', 3000000000, 13200000,  660.00, NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), NULL, '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWm', 'sig014ccc', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', 4000000000, 10000000000, 4000.00, NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), NULL, 'EPHKPvFqMjczRHyDstUcxGzmUTqehz1iqPzSGCiuNpqS', 'sig014ddd', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 1000000000000, 2500000000, 2500.00, NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), NULL, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sig014eee', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 2500000000, 750000000,  750.00, NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), NULL, 'CzumNEBHuFzBifJHEWhpzSRMbCDqMGxtKtPSUBQJGv7m', 'sig014fff', 'So11111111111111111111111111111111111111112', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 3000000000, 75000000000, 675.00, NOW() - INTERVAL '5 days'),
-- Day -3
  (gen_random_uuid(), NULL, 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'sig015aaa', 'So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 12000000000, 2700000000, 2700.00, NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), NULL, '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWm', 'sig015bbb', '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', 'So11111111111111111111111111111111111111112', 8000000000, 35200000,  1760.00, NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), NULL, 'EPHKPvFqMjczRHyDstUcxGzmUTqehz1iqPzSGCiuNpqS', 'sig015ccc', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 5000000000, 2000000000, 2000.00, NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), NULL, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sig015ddd', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 3000000000, 10000000000, 3000.00, NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), NULL, 'CzumNEBHuFzBifJHEWhpzSRMbCDqMGxtKtPSUBQJGv7m', 'sig015eee', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  800000000000, 3200000000, 3200.00, NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), NULL, 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'sig015fff', 'So11111111111111111111111111111111111111112', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  2000000000, 800000000, 440.00, NOW() - INTERVAL '3 days'),
-- Day -1
  (gen_random_uuid(), NULL, '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWm', 'sig016aaa', 'So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 25000000000, 5625000000, 5625.00, NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), NULL, 'EPHKPvFqMjczRHyDstUcxGzmUTqehz1iqPzSGCiuNpqS', 'sig016bbb', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 'So11111111111111111111111111111111111111112', 4000000000, 17600000,   880.00, NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), NULL, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sig016ccc', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 2000000000000, 5000000000, 5000.00, NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), NULL, 'CzumNEBHuFzBifJHEWhpzSRMbCDqMGxtKtPSUBQJGv7m', 'sig016ddd', '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 10000000000, 3200000000, 3200.00, NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), NULL, 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'sig016eee', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 2000000000, 800000000000, 800.00, NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), NULL, '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWm', 'sig016fff', 'So11111111111111111111111111111111111111112', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 5000000000, 125000000000, 1125.00, NOW() - INTERVAL '1 day'),
-- Today
  (gen_random_uuid(), NULL, 'EPHKPvFqMjczRHyDstUcxGzmUTqehz1iqPzSGCiuNpqS', 'sig017aaa', 'So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 30000000000, 6750000000, 6750.00, NOW() - INTERVAL '3 hours'),
  (gen_random_uuid(), NULL, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sig017bbb', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 6000000000, 1800000000, 1800.00, NOW() - INTERVAL '2 hours'),
  (gen_random_uuid(), NULL, 'CzumNEBHuFzBifJHEWhpzSRMbCDqMGxtKtPSUBQJGv7m', 'sig017ccc', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'So11111111111111111111111111111111111111112', 5000000000000, 22000000, 5000.00, NOW() - INTERVAL '1 hour'),
  (gen_random_uuid(), NULL, 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'sig017ddd', '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',  12000000000, 4800000000, 4800.00, NOW() - INTERVAL '30 mins')
ON CONFLICT (signature) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- SWAP TRADES  (indexer-tracked on-chain swaps, for totalSwaps count)
-- ─────────────────────────────────────────────────────────────
INSERT INTO swap_trades (
    id, "walletAddress", signature, "timestamp",
    "tokenTransfers", description, type, "createdAt"
) VALUES
  (gen_random_uuid(), '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'trade001', EXTRACT(EPOCH FROM NOW() - INTERVAL '29 days')::bigint, '[{"mint":"So11111111111111111111111111111111111111112","amount":1000000000}]', 'SOL → USDC', 'SWAP', NOW() - INTERVAL '29 days'),
  (gen_random_uuid(), 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'trade002', EXTRACT(EPOCH FROM NOW() - INTERVAL '27 days')::bigint, '[{"mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":500000000}]', 'USDC → SOL', 'SWAP', NOW() - INTERVAL '27 days'),
  (gen_random_uuid(), 'CzumNEBHuFzBifJHEWhpzSRMbCDqMGxtKtPSUBQJGv7m', 'trade003', EXTRACT(EPOCH FROM NOW() - INTERVAL '24 days')::bigint, '[{"mint":"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263","amount":10000000000}]', 'BONK → USDC', 'SWAP', NOW() - INTERVAL '24 days'),
  (gen_random_uuid(), '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWm', 'trade004', EXTRACT(EPOCH FROM NOW() - INTERVAL '20 days')::bigint, '[{"mint":"So11111111111111111111111111111111111111112","amount":2000000000}]', 'SOL → JTO',  'SWAP', NOW() - INTERVAL '20 days'),
  (gen_random_uuid(), 'EPHKPvFqMjczRHyDstUcxGzmUTqehz1iqPzSGCiuNpqS', 'trade005', EXTRACT(EPOCH FROM NOW() - INTERVAL '16 days')::bigint, '[{"mint":"EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm","amount":3000000000}]', 'WIF → USDC', 'SWAP', NOW() - INTERVAL '16 days'),
  (gen_random_uuid(), '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'trade006', EXTRACT(EPOCH FROM NOW() - INTERVAL '12 days')::bigint, '[{"mint":"4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R","amount":1500000000}]', 'RAY → SOL',  'SWAP', NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), 'BrG44HdsEhzapvs8bEqzvkq4egwevS3fRE6ze2ENo6S2', 'trade007', EXTRACT(EPOCH FROM NOW() - INTERVAL '8 days')::bigint,  '[{"mint":"So11111111111111111111111111111111111111112","amount":5000000000}]', 'SOL → BONK', 'SWAP', NOW() - INTERVAL '8 days'),
  (gen_random_uuid(), 'CzumNEBHuFzBifJHEWhpzSRMbCDqMGxtKtPSUBQJGv7m', 'trade008', EXTRACT(EPOCH FROM NOW() - INTERVAL '4 days')::bigint,  '[{"mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":2000000000}]', 'USDC → WIF', 'SWAP', NOW() - INTERVAL '4 days'),
  (gen_random_uuid(), '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWm', 'trade009', EXTRACT(EPOCH FROM NOW() - INTERVAL '2 days')::bigint,  '[{"mint":"jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL","amount":1000000000}]',  'JTO → USDC', 'SWAP', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), 'EPHKPvFqMjczRHyDstUcxGzmUTqehz1iqPzSGCiuNpqS', 'trade010', EXTRACT(EPOCH FROM NOW() - INTERVAL '6 hours')::bigint,  '[{"mint":"So11111111111111111111111111111111111111112","amount":8000000000}]', 'SOL → RAY',  'SWAP', NOW() - INTERVAL '6 hours')
ON CONFLICT (signature) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Quick sanity check
-- ─────────────────────────────────────────────────────────────
SELECT 'users'           AS "table", COUNT(*) FROM users
UNION ALL
SELECT 'swap_executions' AS "table", COUNT(*) FROM swap_executions
UNION ALL
SELECT 'swap_trades'     AS "table", COUNT(*) FROM swap_trades;
