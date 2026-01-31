-- Insert sample admin user
INSERT INTO users (id, email, password_hash, role, email_verified) VALUES 
(uuid_generate_v4(), 'admin@mentorplatform.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdXwtGtrKxQ7i', 'ADMIN', true);

-- Insert sample mentor users
INSERT INTO users (id, email, password_hash, role, email_verified) VALUES 
(uuid_generate_v4(), 'mentor1@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdXwtGtrKxQ7i', 'MENTOR', true),
(uuid_generate_v4(), 'mentor2@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdXwtGtrKxQ7i', 'MENTOR', true);

-- Insert sample student users
INSERT INTO users (id, email, password_hash, role, email_verified) VALUES 
(uuid_generate_v4(), 'student1@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdXwtGtrKxQ7i', 'STUDENT', true),
(uuid_generate_v4(), 'student2@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdXwtGtrKxQ7i', 'STUDENT', true);

-- Insert mentor profiles
INSERT INTO mentor_profiles (user_id, first_name, last_name, bio, expertise_areas, years_of_experience, hourly_rate, rating, total_sessions)
SELECT 
    u.id,
    'John',
    'Smith',
    'Experienced software engineer with expertise in full-stack development and mentoring junior developers.',
    ARRAY['JavaScript', 'React', 'Node.js', 'TypeScript'],
    8,
    75.00,
    4.8,
    45
FROM users u WHERE u.email = 'mentor1@example.com';

INSERT INTO mentor_profiles (user_id, first_name, last_name, bio, expertise_areas, years_of_experience, hourly_rate, rating, total_sessions)
SELECT 
    u.id,
    'Sarah',
    'Johnson',
    'Data scientist and machine learning expert with a passion for teaching and helping others grow in the field.',
    ARRAY['Python', 'Machine Learning', 'Data Science', 'TensorFlow'],
    6,
    85.00,
    4.9,
    32
FROM users u WHERE u.email = 'mentor2@example.com';

-- Insert student profiles
INSERT INTO student_profiles (user_id, first_name, last_name, bio, learning_goals, interests, current_level)
SELECT 
    u.id,
    'Alice',
    'Brown',
    'Computer science student looking to improve my web development skills and learn industry best practices.',
    ARRAY['Learn React', 'Improve JavaScript skills', 'Build portfolio projects'],
    ARRAY['Web Development', 'Frontend', 'UI/UX'],
    'INTERMEDIATE'
FROM users u WHERE u.email = 'student1@example.com';

INSERT INTO student_profiles (user_id, first_name, last_name, bio, learning_goals, interests, current_level)
SELECT 
    u.id,
    'Bob',
    'Wilson',
    'Career changer transitioning into data science. Eager to learn from experienced professionals.',
    ARRAY['Learn Python', 'Understand ML algorithms', 'Build data projects'],
    ARRAY['Data Science', 'Machine Learning', 'Statistics'],
    'BEGINNER'
FROM users u WHERE u.email = 'student2@example.com';

-- Insert availability slots for mentors
INSERT INTO availability_slots (mentor_id, day_of_week, start_time, end_time, timezone)
SELECT 
    u.id,
    1, -- Monday
    '09:00',
    '17:00',
    'America/New_York'
FROM users u WHERE u.email = 'mentor1@example.com';

INSERT INTO availability_slots (mentor_id, day_of_week, start_time, end_time, timezone)
SELECT 
    u.id,
    3, -- Wednesday
    '14:00',
    '18:00',
    'America/Los_Angeles'
FROM users u WHERE u.email = 'mentor2@example.com';

-- Insert preferred session types for students
INSERT INTO preferred_session_types (student_id, session_type)
SELECT u.id, 'ONE_ON_ONE' FROM users u WHERE u.email = 'student1@example.com';

INSERT INTO preferred_session_types (student_id, session_type)
SELECT u.id, 'GROUP' FROM users u WHERE u.email = 'student2@example.com';

-- Insert sample sessions
INSERT INTO sessions (id, mentor_id, title, description, expertise_areas, session_type, scheduled_at, duration, capacity)
SELECT 
    uuid_generate_v4(),
    u.id,
    'React Fundamentals Workshop',
    'Learn the basics of React including components, state, and props. Perfect for beginners.',
    ARRAY['React', 'JavaScript', 'Frontend'],
    'WORKSHOP',
    NOW() + INTERVAL '7 days',
    120,
    10
FROM users u WHERE u.email = 'mentor1@example.com';

INSERT INTO sessions (id, mentor_id, title, description, expertise_areas, session_type, scheduled_at, duration, capacity)
SELECT 
    uuid_generate_v4(),
    u.id,
    'Python for Data Science',
    'Introduction to Python programming for data science applications.',
    ARRAY['Python', 'Data Science'],
    'GROUP',
    NOW() + INTERVAL '5 days',
    90,
    6
FROM users u WHERE u.email = 'mentor2@example.com';

-- Insert default notification preferences
INSERT INTO notification_preferences (user_id, preferences)
SELECT 
    id,
    '{
        "SESSION_REMINDER": ["EMAIL", "IN_APP"],
        "SESSION_CANCELLED": ["EMAIL", "IN_APP", "SMS"],
        "NEW_MESSAGE": ["IN_APP"],
        "REGISTRATION_CONFIRMED": ["EMAIL", "IN_APP"],
        "WAITLIST_PROMOTED": ["EMAIL", "IN_APP", "SMS"],
        "REVIEW_REQUEST": ["EMAIL", "IN_APP"],
        "SYSTEM_ALERT": ["EMAIL", "IN_APP"]
    }'::jsonb
FROM users;