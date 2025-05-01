import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class DatabaseHandler {
    private static final String DB_URL = "jdbc:mysql://localhost:3306/mentor_matching";
    private static final String DB_USER = "root";
    private static final String DB_PASSWORD = "Yourpassword";

    private Connection getConnection() throws SQLException {
        return DriverManager.getConnection(DB_URL, DB_USER, DB_PASSWORD);
    }

    private void closeResources(Connection conn, Statement stmt, ResultSet rs) {
        try {
            if (rs != null) rs.close();
            if (stmt != null) stmt.close();
            if (conn != null) conn.close();
        } catch (SQLException e) {
            System.err.println("Error closing resources: " + e.getMessage());
        }
    }

    // Register a user
    public boolean registerUser(String name, String email, String password, String role, String expertise) {
        Connection conn = null;
        PreparedStatement stmt = null;
        boolean success = false;

        try {
            conn = getConnection();
            String query = "INSERT INTO users (name, email, password, role, expertise) VALUES (?, ?, ?, ?, ?)";
            stmt = conn.prepareStatement(query);
            stmt.setString(1, name);
            stmt.setString(2, email);
            stmt.setString(3, password); // NOTE: Use password hashing in production
            stmt.setString(4, role);

            if ("student".equals(role) || expertise == null || expertise.isEmpty()) {
                stmt.setNull(5, java.sql.Types.VARCHAR);
            } else {
                stmt.setString(5, expertise);
            }

            int rowsAffected = stmt.executeUpdate();
            success = rowsAffected > 0;
        } catch (SQLException e) {
            System.err.println("Error registering user: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, null);
        }

        return success;
    }

    // Retrieve sessions for a specific mentor
    public Session[] getSessionsByMentorId(int mentorId) {
        List<Session> sessions = new ArrayList<>();
        Connection conn = null;
        PreparedStatement stmt = null;
        ResultSet rs = null;

        try {
            conn = getConnection();
            String query = "SELECT * FROM sessions WHERE mentor_id = ?";
            stmt = conn.prepareStatement(query);
            stmt.setInt(1, mentorId);
            rs = stmt.executeQuery();

            while (rs.next()) {
                Session session = new Session(
                        rs.getInt("session_id"),
                        rs.getInt("mentor_id"),
                        rs.getString("title"),
                        rs.getString("description"),
                        rs.getString("expertise_tag"),
                        rs.getTimestamp("start_time"),
                        rs.getInt("duration"),
                        rs.getInt("capacity")
                );
                sessions.add(session);
            }
        } catch (SQLException e) {
            System.err.println("Error fetching sessions: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, rs);
        }

        return sessions.toArray(new Session[0]);
    }

    // Retrieve a session by ID
    public Session getSessionById(int sessionId) {
        Connection conn = null;
        PreparedStatement stmt = null;
        ResultSet rs = null;
        Session session = null;

        try {
            conn = getConnection();
            String query = "SELECT * FROM sessions WHERE session_id = ?";
            stmt = conn.prepareStatement(query);
            stmt.setInt(1, sessionId);
            rs = stmt.executeQuery();

            if (rs.next()) {
                session = new Session(
                        rs.getInt("session_id"),
                        rs.getInt("mentor_id"),
                        rs.getString("title"),
                        rs.getString("description"),
                        rs.getString("expertise_tag"),
                        rs.getTimestamp("start_time"),
                        rs.getInt("duration"),
                        rs.getInt("capacity")
                );
            }
        } catch (SQLException e) {
            System.err.println("Error fetching session: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, rs);
        }

        return session;
    }

    // Create a new session
    public boolean createSession(Session session) {
        Connection conn = null;
        PreparedStatement stmt = null;
        boolean success = false;

        try {
            conn = getConnection();
            String query = "INSERT INTO sessions (mentor_id, title, description, expertise_tag, start_time, duration, capacity) VALUES (?, ?, ?, ?, ?, ?, ?)";
            stmt = conn.prepareStatement(query);
            stmt.setInt(1, session.getMentorId());
            stmt.setString(2, session.getTitle());
            stmt.setString(3, session.getDescription());
            stmt.setString(4, session.getExpertiseTag());
            stmt.setTimestamp(5, session.getStartTime());
            stmt.setInt(6, session.getDuration());
            stmt.setInt(7, session.getCapacity());

            int rowsAffected = stmt.executeUpdate();
            success = rowsAffected > 0;
        } catch (SQLException e) {
            System.err.println("Error creating session: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, null);
        }

        return success;
    }

    // Update an existing session
    public boolean updateSession(Session session) {
        Connection conn = null;
        PreparedStatement stmt = null;
        boolean success = false;

        try {
            conn = getConnection();
            String query = "UPDATE sessions SET mentor_id=?, title=?, description=?, expertise_tag=?, start_time=?, duration=?, capacity=? WHERE session_id=?";
            stmt = conn.prepareStatement(query);
            stmt.setInt(1, session.getMentorId());
            stmt.setString(2, session.getTitle());
            stmt.setString(3, session.getDescription());
            stmt.setString(4, session.getExpertiseTag());
            stmt.setTimestamp(5, session.getStartTime());
            stmt.setInt(6, session.getDuration());
            stmt.setInt(7, session.getCapacity());
            stmt.setInt(8, session.getSessionId());

            int rowsAffected = stmt.executeUpdate();
            success = rowsAffected > 0;
        } catch (SQLException e) {
            System.err.println("Error updating session: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, null);
        }

        return success;
    }

    // Delete a session
    public boolean deleteSession(int sessionId) {
        Connection conn = null;
        PreparedStatement stmt = null;
        boolean success = false;

        try {
            conn = getConnection();
            String query = "DELETE FROM sessions WHERE session_id=?";
            stmt = conn.prepareStatement(query);
            stmt.setInt(1, sessionId);

            int rowsAffected = stmt.executeUpdate();
            success = rowsAffected > 0;
        } catch (SQLException e) {
            System.err.println("Error deleting session: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, null);
        }

        return success;
    }

    // Retrieve all available future sessions
    public Session[] getAllAvailableSessions() {
        List<Session> sessions = new ArrayList<>();
        Connection conn = null;
        PreparedStatement stmt = null;
        ResultSet rs = null;

        try {
            conn = getConnection();
//            String query = "SELECT * FROM sessions WHERE start_time > NOW()";
            String query = "SELECT * FROM sessions";
            stmt = conn.prepareStatement(query);
            rs = stmt.executeQuery();

            while (rs.next()) {
                Session session = new Session(
                        rs.getInt("session_id"),
                        rs.getInt("mentor_id"),
                        rs.getString("title"),
                        rs.getString("description"),
                        rs.getString("expertise_tag"),
                        rs.getTimestamp("start_time"),
                        rs.getInt("duration"),
                        rs.getInt("capacity")
                );
                sessions.add(session);
            }
        } catch (SQLException e) {
            System.err.println("Error fetching available sessions: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, rs);
        }

        return sessions.toArray(new Session[0]);
    }

    public int authenticateUser(String email, String password) {
        Connection conn = null;
        PreparedStatement stmt = null;
        ResultSet rs = null;
        int userId = -1;

        try {
            conn = getConnection();
            String query = "SELECT user_id FROM users WHERE email = ? AND password = ?";
            stmt = conn.prepareStatement(query);
            stmt.setString(1, email);
            stmt.setString(2, password); // Note: In production, use password hashing

            rs = stmt.executeQuery();
            if (rs.next()) {
                userId = rs.getInt("user_id");
            }
        } catch (SQLException e) {
            System.err.println("Error authenticating user: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, rs);
        }

        return userId;
    }

    public boolean isEmailExists(String email) {
        Connection conn = null;
        PreparedStatement stmt = null;
        ResultSet rs = null;
        boolean exists = false;

        try {
            conn = getConnection();
            String query = "SELECT 1 FROM users WHERE email = ?";
            stmt = conn.prepareStatement(query);
            stmt.setString(1, email);

            rs = stmt.executeQuery();
            exists = rs.next();
        } catch (SQLException e) {
            System.err.println("Error checking email existence: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, rs);
        }

        return exists;
    }

    public User getUserById(int userId) {
        Connection conn = null;
        PreparedStatement stmt = null;
        ResultSet rs = null;
        User user = null;

        try {
            conn = getConnection();
            String query = "SELECT * FROM users WHERE user_id = ?";
            stmt = conn.prepareStatement(query);
            stmt.setInt(1, userId);

            rs = stmt.executeQuery();
            if (rs.next()) {
                user = new User(
                        rs.getInt("user_id"),
                        rs.getString("name"),
                        rs.getString("email"),
                        rs.getString("role"),
                        rs.getString("expertise")
                );
            }
        } catch (SQLException e) {
            System.err.println("Error retrieving user: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, rs);
        }

        return user;
    }
    public Session[] getSessionsByExpertise(String expertiseTag) {
        List<Session> sessions = new ArrayList<>();
        Connection conn = null;
        PreparedStatement stmt = null;
        ResultSet rs = null;

        try {
            conn = getConnection();
            //String query = "SELECT * FROM sessions WHERE expertise_tag = ? AND start_time > NOW()";
            String query = "SELECT * FROM sessions WHERE expertise_tag = ? AND start_time > NOW()";
            stmt = conn.prepareStatement(query);
            stmt.setString(1, expertiseTag);
            rs = stmt.executeQuery();

            while (rs.next()) {
                Session session = new Session(
                        rs.getInt("session_id"),
                        rs.getInt("mentor_id"),
                        rs.getString("title"),
                        rs.getString("description"),
                        rs.getString("expertise_tag"),
                        rs.getTimestamp("start_time"),
                        rs.getInt("duration"),
                        rs.getInt("capacity")
                );
                sessions.add(session);
            }
        } catch (SQLException e) {
            System.err.println("Error fetching sessions by expertise: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, rs);
        }

        return sessions.toArray(new Session[0]);
    }

    // Retrieve mentor name by mentor ID for displaying in the student dashboard
    public String getMentorNameById(int mentorId) {
        Connection conn = null;
        PreparedStatement stmt = null;
        ResultSet rs = null;
        String mentorName = "Unknown";

        try {
            conn = getConnection();
            String query = "SELECT name FROM users WHERE user_id = ? AND role = 'mentor'";
            stmt = conn.prepareStatement(query);
            stmt.setInt(1, mentorId);
            rs = stmt.executeQuery();

            if (rs.next()) {
                mentorName = rs.getString("name");
            }
        } catch (SQLException e) {
            System.err.println("Error fetching mentor name: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, rs);
        }

        return mentorName;
    }

    // Update user profile information
    public boolean updateUserProfile(int userId, String name, String email, String password) {
        Connection conn = null;
        PreparedStatement stmt = null;
        boolean success = false;

        try {
            conn = getConnection();
            String query = "UPDATE users SET name = ?, email = ?";

            // Only update password if provided
            if (password != null && !password.isEmpty()) {
                query += ", password = ?";
            }

            query += " WHERE user_id = ?";
            stmt = conn.prepareStatement(query);
            stmt.setString(1, name);
            stmt.setString(2, email);

            if (password != null && !password.isEmpty()) {
                stmt.setString(3, password); // Note: Use password hashing in production
                stmt.setInt(4, userId);
            } else {
                stmt.setInt(3, userId);
            }

            int rowsAffected = stmt.executeUpdate();
            success = rowsAffected > 0;
        } catch (SQLException e) {
            System.err.println("Error updating user profile: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, null);
        }

        return success;
    }

    // Register student for a session
    public boolean registerForSession(int sessionId, int studentId) {
        Connection conn = null;
        PreparedStatement stmt = null;
        boolean success = false;

        try {
            conn = getConnection();

            // First check if already registered
            if (isAlreadyRegistered(sessionId, studentId)) {
                return false;
            }

            // Check if session is full
            if (isSessionFull(sessionId)) {
                return false;
            }

            // Add registration
            String query = "INSERT INTO bookings (session_id, student_id, status) VALUES (?, ?, 'confirmed')";
            stmt = conn.prepareStatement(query);
            stmt.setInt(1, sessionId);
            stmt.setInt(2, studentId);

            int rowsAffected = stmt.executeUpdate();
            success = rowsAffected > 0;
        } catch (SQLException e) {
            System.err.println("Error registering for session: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, null);
        }

        return success;
    }

    // Check if student is already registered for a session
    private boolean isAlreadyRegistered(int sessionId, int studentId) {
        Connection conn = null;
        PreparedStatement stmt = null;
        ResultSet rs = null;
        boolean registered = false;

        try {
            conn = getConnection();
            String query = "SELECT 1 FROM bookings WHERE session_id = ? AND student_id = ?";
            stmt = conn.prepareStatement(query);
            stmt.setInt(1, sessionId);
            stmt.setInt(2, studentId);
            rs = stmt.executeQuery();

            registered = rs.next();
        } catch (SQLException e) {
            System.err.println("Error checking registration: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, rs);
        }

        return registered;
    }

    // Check if a session is full
    private boolean isSessionFull(int sessionId) {
        Connection conn = null;
        PreparedStatement stmt = null;
        ResultSet rs = null;
        boolean isFull = false;

        try {
            conn = getConnection();

            // Get current registrations count
            String countQuery = "SELECT COUNT(*) as count FROM bookings WHERE session_id = ?";
            stmt = conn.prepareStatement(countQuery);
            stmt.setInt(1, sessionId);
            rs = stmt.executeQuery();

            int currentCount = 0;
            if (rs.next()) {
                currentCount = rs.getInt("count");
            }

            rs.close();
            stmt.close();

            // Get session capacity
            String capacityQuery = "SELECT capacity FROM sessions WHERE session_id = ?";
            stmt = conn.prepareStatement(capacityQuery);
            stmt.setInt(1, sessionId);
            rs = stmt.executeQuery();

            int capacity = 0;
            if (rs.next()) {
                capacity = rs.getInt("capacity");
            }

            isFull = currentCount >= capacity;
        } catch (SQLException e) {
            System.err.println("Error checking if session is full: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, rs);
        }

        return isFull;
    }

    // Cancel registration for a session
    public boolean cancelRegistration(int sessionId, int studentId) {
        Connection conn = null;
        PreparedStatement stmt = null;
        boolean success = false;

        try {
            conn = getConnection();
            String query = "DELETE FROM bookings WHERE session_id = ? AND student_id = ?";
            stmt = conn.prepareStatement(query);
            stmt.setInt(1, sessionId);
            stmt.setInt(2, studentId);

            int rowsAffected = stmt.executeUpdate();
            success = rowsAffected > 0;
        } catch (SQLException e) {
            System.err.println("Error canceling registration: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, null);
        }

        return success;
    }

    // Get all sessions that a student is registered for
    public Session[] getRegisteredSessions(int studentId) {
        List<Session> sessions = new ArrayList<>();
        Connection conn = null;
        PreparedStatement stmt = null;
        ResultSet rs = null;

        try {
            conn = getConnection();
            String query = "SELECT s.* FROM sessions s " +
                    "JOIN bookings r ON s.session_id = r.session_id " +
                    "WHERE r.student_id = ? " +
                    "ORDER BY s.start_time";
            stmt = conn.prepareStatement(query);
            stmt.setInt(1, studentId);
            rs = stmt.executeQuery();

            while (rs.next()) {
                Session session = new Session(
                        rs.getInt("session_id"),
                        rs.getInt("mentor_id"),
                        rs.getString("title"),
                        rs.getString("description"),
                        rs.getString("expertise_tag"),
                        rs.getTimestamp("start_time"),
                        rs.getInt("duration"),
                        rs.getInt("capacity")
                );
                sessions.add(session);
            }
        } catch (SQLException e) {
            System.err.println("Error fetching registered sessions: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, rs);
        }

        return sessions.toArray(new Session[0]);
    }

    // Check registration status for a student and session
    public String getRegistrationStatus(int sessionId, int studentId) {
        Connection conn = null;
        PreparedStatement stmt = null;
        ResultSet rs = null;
        String status = "not_registered";

        try {
            conn = getConnection();
            String query = "SELECT status FROM bookings WHERE session_id = ? AND student_id = ?";
            stmt = conn.prepareStatement(query);
            stmt.setInt(1, sessionId);
            stmt.setInt(2, studentId);
            rs = stmt.executeQuery();

            if (rs.next()) {
                status = rs.getString("status");
            }
        } catch (SQLException e) {
            System.err.println("Error checking registration status: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, rs);
        }

        return status;
    }

    // Get all available expertise areas for filtering
    public String[] getAllExpertiseTags() {
        List<String> expertiseTags = new ArrayList<>();
        Connection conn = null;
        Statement stmt = null;
        ResultSet rs = null;

        try {
            conn = getConnection();
            //String query = "SELECT DISTINCT expertise_tag FROM sessions WHERE start_time > NOW()";
            String query = "SELECT DISTINCT expertise_tag FROM sessions WHERE start_time > NOW()";
            stmt = conn.createStatement();
            rs = stmt.executeQuery(query);

            while (rs.next()) {
                String tag = rs.getString("expertise_tag");
                if (tag != null && !tag.isEmpty()) {
                    expertiseTags.add(tag);
                }
            }
        } catch (SQLException e) {
            System.err.println("Error fetching expertise tags: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, rs);
        }

        return expertiseTags.toArray(new String[0]);
    }
    // Get all mentors from the user table
    public User[] getAllMentors() {
        List<User> mentors = new ArrayList<>();
        Connection conn = null;
        PreparedStatement stmt = null;
        ResultSet rs = null;

        try {
            conn = getConnection();
            String query = "SELECT * FROM users WHERE role = 'mentor'";
            stmt = conn.prepareStatement(query);
            rs = stmt.executeQuery();

            while (rs.next()) {
                User mentor = new User(
                        rs.getInt("user_id"),
                        rs.getString("name"),
                        rs.getString("email"),
                        rs.getString("role"),
                        rs.getString("expertise")
                );
                mentors.add(mentor);
            }
        } catch (SQLException e) {
            System.err.println("Error fetching mentors: " + e.getMessage());
        } finally {
            closeResources(conn, stmt, rs);
        }

        return mentors.toArray(new User[0]);
    }
}