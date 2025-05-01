import java.sql.Timestamp;

/**
 * Session - Model class to represent a mentoring session in the Mentor Matching application
 * This class holds session data and provides getters and setters for access
 */
public class Session {
    private int sessionId;
    private int mentorId;
    private String title;
    private String description;
    private String expertiseTag;
    private Timestamp startTime;
    private int duration;  // in minutes
    private int capacity;

    /**
     * Constructor for Session
     *
     * @param sessionId Session's unique ID
     * @param mentorId ID of the mentor conducting the session
     * @param title Session title
     * @param description Session description
     * @param expertiseTag Area of expertise for this session
     * @param startTime Timestamp when the session starts
     * @param duration Duration in minutes
     * @param capacity Maximum number of students that can register
     */
    public Session(int sessionId, int mentorId, String title, String description,
                   String expertiseTag, Timestamp startTime, int duration, int capacity) {
        this.sessionId = sessionId;
        this.mentorId = mentorId;
        this.title = title;
        this.description = description;
        this.expertiseTag = expertiseTag;
        this.startTime = startTime;
        this.duration = duration;
        this.capacity = capacity;
    }

    /**
     * Constructor for creating a new session (without sessionId)
     *
     * @param mentorId ID of the mentor conducting the session
     * @param title Session title
     * @param description Session description
     * @param expertiseTag Area of expertise for this session
     * @param startTime Timestamp when the session starts
     * @param duration Duration in minutes
     * @param capacity Maximum number of students that can register
     */
    public Session(int mentorId, String title, String description,
                   String expertiseTag, Timestamp startTime, int duration, int capacity) {
        this(-1, mentorId, title, description, expertiseTag, startTime, duration, capacity);
    }

    /**
     * Get session ID
     * @return Session ID
     */
    public int getSessionId() {
        return sessionId;
    }

    /**
     * Set session ID
     * @param sessionId Session ID to set
     */
    public void setSessionId(int sessionId) {
        this.sessionId = sessionId;
    }

    /**
     * Get mentor ID
     * @return Mentor ID
     */
    public int getMentorId() {
        return mentorId;
    }

    /**
     * Set mentor ID
     * @param mentorId Mentor ID to set
     */
    public void setMentorId(int mentorId) {
        this.mentorId = mentorId;
    }

    /**
     * Get session title
     * @return Session title
     */
    public String getTitle() {
        return title;
    }

    /**
     * Set session title
     * @param title Title to set
     */
    public void setTitle(String title) {
        this.title = title;
    }

    /**
     * Get session description
     * @return Session description
     */
    public String getDescription() {
        return description;
    }

    /**
     * Set session description
     * @param description Description to set
     */
    public void setDescription(String description) {
        this.description = description;
    }

    /**
     * Get expertise tag
     * @return Expertise tag
     */
    public String getExpertiseTag() {
        return expertiseTag;
    }

    /**
     * Set expertise tag
     * @param expertiseTag Expertise tag to set
     */
    public void setExpertiseTag(String expertiseTag) {
        this.expertiseTag = expertiseTag;
    }

    /**
     * Get start time
     * @return Start time
     */
    public Timestamp getStartTime() {
        return startTime;
    }

    /**
     * Set start time
     * @param startTime Start time to set
     */
    public void setStartTime(Timestamp startTime) {
        this.startTime = startTime;
    }

    /**
     * Get duration
     * @return Duration in minutes
     */
    public int getDuration() {
        return duration;
    }

    /**
     * Set duration
     * @param duration Duration in minutes to set
     */
    public void setDuration(int duration) {
        this.duration = duration;
    }

    /**
     * Get capacity
     * @return Maximum capacity
     */
    public int getCapacity() {
        return capacity;
    }

    /**
     * Set capacity
     * @param capacity Capacity to set
     */
    public void setCapacity(int capacity) {
        this.capacity = capacity;
    }

    /**
     * String representation of Session
     * @return String representation
     */
    @Override
    public String toString() {
        return title + " - " + expertiseTag + " (" + startTime + ")";
    }
}