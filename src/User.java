/**
 * User - Model class to represent a user in the Mentor Matching application
 * This class holds user data and provides getters and setters for access
 */
public class User {
    private int userId;
    private String name;
    private String email;
    private String role;
    private String expertise;

    /**
     * Constructor for User
     *
     * @param userId User's unique ID
     * @param name User's full name
     * @param email User's email address
     * @param role User's role (mentor or student)
     * @param expertise User's area of expertise
     */
    public User(int userId, String name, String email, String role, String expertise) {
        this.userId = userId;
        this.name = name;
        this.email = email;
        this.role = role;
        this.expertise = expertise;
    }

    /**
     * Get user ID
     * @return User ID
     */
    public int getUserId() {
        return userId;
    }

    /**
     * Set user ID
     * @param userId User ID to set
     */
    public void setUserId(int userId) {
        this.userId = userId;
    }

    /**
     * Get user's name
     * @return User's name
     */
    public String getName() {
        return name;
    }

    /**
     * Set user's name
     * @param name Name to set
     */
    public void setName(String name) {
        this.name = name;
    }

    /**
     * Get user's email
     * @return User's email
     */
    public String getEmail() {
        return email;
    }

    /**
     * Set user's email
     * @param email Email to set
     */
    public void setEmail(String email) {
        this.email = email;
    }

    /**
     * Get user's role
     * @return User's role (mentor or student)
     */
    public String getRole() {
        return role;
    }

    /**
     * Set user's role
     * @param role Role to set (mentor or student)
     */
    public void setRole(String role) {
        this.role = role;
    }

    /**
     * Get user's expertise
     * @return User's expertise
     */
    public String getExpertise() {
        return expertise;
    }

    /**
     * Set user's expertise
     * @param expertise Expertise to set
     */
    public void setExpertise(String expertise) {
        this.expertise = expertise;
    }

    /**
     * Check if user is a mentor
     * @return true if mentor, false if student
     */
    public boolean isMentor() {
        return "mentor".equalsIgnoreCase(role);
    }

    /**
     * String representation of User
     * @return String representation
     */
    @Override
    public String toString() {
        return name + " (" + role + ") - " + expertise;
    }
}