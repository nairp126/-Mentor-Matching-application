import javax.swing.*;
import javax.swing.table.DefaultTableModel;
import java.awt.*;
import java.awt.event.*;
import java.sql.Timestamp;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;

/**
 * MentorDashboard - Dashboard for mentors to manage their sessions
 */
public class MentorDashboard extends JFrame {
    private User currentUser;
    private DatabaseHandler dbHandler;
    private JTable sessionTable;
    private DefaultTableModel tableModel;
    private JButton addSessionButton;
    private JButton editSessionButton;
    private JButton deleteSessionButton;
    private JButton refreshButton;
    private JButton logoutButton;

    /**
     * Constructor for MentorDashboard
     *
     * @param user The current mentor user
     */
    public MentorDashboard(User user) {
        this.currentUser = user;
        this.dbHandler = new DatabaseHandler();

        // Validate that this is a mentor account
        if (!user.isMentor()) {
            JOptionPane.showMessageDialog(this,
                    "Error: This dashboard is only for mentors.",
                    "Access Denied",
                    JOptionPane.ERROR_MESSAGE);
            dispose();
            return;
        }

        initializeUI();
        loadSessions();
    }

    /**
     * Initialize the UI components
     */
    private void initializeUI() {
        setTitle("Mentor Dashboard - " + currentUser.getName());
        setSize(900, 600);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setLocationRelativeTo(null);

        // Main panel with border layout
        JPanel mainPanel = new JPanel(new BorderLayout(10, 10));
        mainPanel.setBorder(BorderFactory.createEmptyBorder(20, 20, 20, 20));

        // Header panel
        JPanel headerPanel = new JPanel(new BorderLayout());
        JLabel welcomeLabel = new JLabel("Welcome, " + currentUser.getName() + " (" + currentUser.getExpertise() + ")");
        welcomeLabel.setFont(new Font("Arial", Font.BOLD, 18));
        headerPanel.add(welcomeLabel, BorderLayout.WEST);

        logoutButton = new JButton("Logout");
        logoutButton.addActionListener(e -> logout());
        headerPanel.add(logoutButton, BorderLayout.EAST);

        // Table panel for sessions
        JPanel tablePanel = new JPanel(new BorderLayout(0, 10));
        JLabel sessionsLabel = new JLabel("Your Sessions");
        sessionsLabel.setFont(new Font("Arial", Font.BOLD, 14));
        tablePanel.add(sessionsLabel, BorderLayout.NORTH);

        // Create table model with column names
        String[] columnNames = {"ID", "Title", "Expertise", "Description", "Start Time", "Duration (min)", "Capacity"};
        tableModel = new DefaultTableModel(columnNames, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return false; // Make table read-only
            }
        };

        sessionTable = new JTable(tableModel);
        sessionTable.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
        sessionTable.getTableHeader().setReorderingAllowed(false);

        // Adjust column widths
        sessionTable.getColumnModel().getColumn(0).setPreferredWidth(30); // ID
        sessionTable.getColumnModel().getColumn(1).setPreferredWidth(150); // Title
        sessionTable.getColumnModel().getColumn(2).setPreferredWidth(100); // Expertise
        sessionTable.getColumnModel().getColumn(3).setPreferredWidth(250); // Description
        sessionTable.getColumnModel().getColumn(4).setPreferredWidth(150); // Start Time
        sessionTable.getColumnModel().getColumn(5).setPreferredWidth(100); // Duration
        sessionTable.getColumnModel().getColumn(6).setPreferredWidth(80); // Capacity

        JScrollPane scrollPane = new JScrollPane(sessionTable);
        tablePanel.add(scrollPane, BorderLayout.CENTER);

        // Button panel
        JPanel buttonPanel = new JPanel(new FlowLayout(FlowLayout.LEFT));
        addSessionButton = new JButton("Add Session");
        editSessionButton = new JButton("Edit Session");
        deleteSessionButton = new JButton("Delete Session");
        refreshButton = new JButton("Refresh");

        // Set initial state for edit/delete buttons (disabled until selection)
        editSessionButton.setEnabled(false);
        deleteSessionButton.setEnabled(false);

        // Add action listeners
        addSessionButton.addActionListener(e -> openSessionForm(null));
        editSessionButton.addActionListener(e -> {
            int selectedRow = sessionTable.getSelectedRow();
            if (selectedRow >= 0) {
                int sessionId = (int) tableModel.getValueAt(selectedRow, 0);
                Session session = dbHandler.getSessionById(sessionId);
                if (session != null) {
                    openSessionForm(session);
                }
            }
        });

        deleteSessionButton.addActionListener(e -> {
            int selectedRow = sessionTable.getSelectedRow();
            if (selectedRow >= 0) {
                int sessionId = (int) tableModel.getValueAt(selectedRow, 0);
                deleteSession(sessionId);
            }
        });

        refreshButton.addActionListener(e -> loadSessions());

        // Add selection listener to table
        sessionTable.getSelectionModel().addListSelectionListener(e -> {
            boolean hasSelection = sessionTable.getSelectedRow() >= 0;
            editSessionButton.setEnabled(hasSelection);
            deleteSessionButton.setEnabled(hasSelection);
        });

        // Add buttons to panel
        buttonPanel.add(addSessionButton);
        buttonPanel.add(editSessionButton);
        buttonPanel.add(deleteSessionButton);
        buttonPanel.add(refreshButton);

        tablePanel.add(buttonPanel, BorderLayout.SOUTH);

        // Add panels to main panel
        mainPanel.add(headerPanel, BorderLayout.NORTH);
        mainPanel.add(tablePanel, BorderLayout.CENTER);

        // Add main panel to frame
        setContentPane(mainPanel);
    }

    /**
     * Load mentor sessions from database and display in table
     */
    private void loadSessions() {
        // Clear the table
        tableModel.setRowCount(0);

        // Get sessions for current mentor
        Session[] sessions = dbHandler.getSessionsByMentorId(currentUser.getUserId());

        // Add sessions to table model
        SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm");

        for (Session session : sessions) {
            Object[] rowData = {
                    session.getSessionId(),
                    session.getTitle(),
                    session.getExpertiseTag(),
                    session.getDescription(),
                    dateFormat.format(session.getStartTime()),
                    session.getDuration(),
                    session.getCapacity()
            };
            tableModel.addRow(rowData);
        }

        // Update the table
        tableModel.fireTableDataChanged();
    }

    /**
     * Open the session form for adding or editing a session
     *
     * @param session Existing session for editing, or null for adding new
     */
    private void openSessionForm(Session session) {
        boolean isEditing = (session != null);
        JDialog sessionDialog = new JDialog(this, isEditing ? "Edit Session" : "Add New Session", true);
        sessionDialog.setSize(500, 500);
        sessionDialog.setLocationRelativeTo(this);

        JPanel mainPanel = new JPanel(new BorderLayout(10, 10));
        mainPanel.setBorder(BorderFactory.createEmptyBorder(20, 20, 20, 20));

        // Form panel
        JPanel formPanel = new JPanel(new GridLayout(7, 1, 10, 10));

        // Title field
        JPanel titlePanel = new JPanel(new BorderLayout(5, 5));
        JLabel titleLabel = new JLabel("Title:");
        JTextField titleField = new JTextField(20);
        if (isEditing) titleField.setText(session.getTitle());
        titlePanel.add(titleLabel, BorderLayout.WEST);
        titlePanel.add(titleField, BorderLayout.CENTER);

        // Expertise tag field
        JPanel expertisePanel = new JPanel(new BorderLayout(5, 5));
        JLabel expertiseLabel = new JLabel("Expertise Tag:");
        JTextField expertiseField = new JTextField(20);
        if (isEditing) expertiseField.setText(session.getExpertiseTag());
        else expertiseField.setText(currentUser.getExpertise()); // Default to mentor's expertise
        expertisePanel.add(expertiseLabel, BorderLayout.WEST);
        expertisePanel.add(expertiseField, BorderLayout.CENTER);

        // Description field
        JPanel descPanel = new JPanel(new BorderLayout(5, 5));
        JLabel descLabel = new JLabel("Description:");
        JTextArea descArea = new JTextArea(4, 20);
        descArea.setLineWrap(true);
        descArea.setWrapStyleWord(true);
        if (isEditing) descArea.setText(session.getDescription());
        JScrollPane descScroll = new JScrollPane(descArea);
        descPanel.add(descLabel, BorderLayout.NORTH);
        descPanel.add(descScroll, BorderLayout.CENTER);

        // Date field
        JPanel datePanel = new JPanel(new BorderLayout(5, 5));
        JLabel dateLabel = new JLabel("Date (yyyy-MM-dd):");
        JTextField dateField = new JTextField(10);
        SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd");
        if (isEditing) dateField.setText(dateFormat.format(session.getStartTime()));
        datePanel.add(dateLabel, BorderLayout.WEST);
        datePanel.add(dateField, BorderLayout.CENTER);

        // Time field
        JPanel timePanel = new JPanel(new BorderLayout(5, 5));
        JLabel timeLabel = new JLabel("Time (HH:mm):");
        JTextField timeField = new JTextField(5);
        SimpleDateFormat timeFormat = new SimpleDateFormat("HH:mm");
        if (isEditing) timeField.setText(timeFormat.format(session.getStartTime()));
        timePanel.add(timeLabel, BorderLayout.WEST);
        timePanel.add(timeField, BorderLayout.CENTER);

        // Duration field
        JPanel durationPanel = new JPanel(new BorderLayout(5, 5));
        JLabel durationLabel = new JLabel("Duration (minutes):");
        JSpinner durationSpinner = new JSpinner(new SpinnerNumberModel(60, 15, 240, 15));
        if (isEditing) durationSpinner.setValue(session.getDuration());
        durationPanel.add(durationLabel, BorderLayout.WEST);
        durationPanel.add(durationSpinner, BorderLayout.CENTER);

        // Capacity field
        JPanel capacityPanel = new JPanel(new BorderLayout(5, 5));
        JLabel capacityLabel = new JLabel("Capacity:");
        JSpinner capacitySpinner = new JSpinner(new SpinnerNumberModel(5, 1, 100, 1));
        if (isEditing) capacitySpinner.setValue(session.getCapacity());
        capacityPanel.add(capacityLabel, BorderLayout.WEST);
        capacityPanel.add(capacitySpinner, BorderLayout.CENTER);

        // Add all panels to form
        formPanel.add(titlePanel);
        formPanel.add(expertisePanel);
        formPanel.add(descPanel);
        formPanel.add(datePanel);
        formPanel.add(timePanel);
        formPanel.add(durationPanel);
        formPanel.add(capacityPanel);

        // Button panel
        JPanel buttonPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        JButton saveButton = new JButton(isEditing ? "Update" : "Save");
        JButton cancelButton = new JButton("Cancel");

        // Status label
        JLabel statusLabel = new JLabel(" ");
        statusLabel.setForeground(Color.RED);

        // Add action listeners
        saveButton.addActionListener(e -> {
            // Validate input
            String title = titleField.getText().trim();
            String expertiseTag = expertiseField.getText().trim();
            String description = descArea.getText().trim();
            String dateStr = dateField.getText().trim();
            String timeStr = timeField.getText().trim();
            int duration = (int) durationSpinner.getValue();
            int capacity = (int) capacitySpinner.getValue();

            if (title.isEmpty() || expertiseTag.isEmpty() || description.isEmpty() ||
                    dateStr.isEmpty() || timeStr.isEmpty()) {
                statusLabel.setText("Please fill in all fields");
                return;
            }

            // Parse date and time
            try {
                SimpleDateFormat dateTimeFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm");
                Date startDate = dateTimeFormat.parse(dateStr + " " + timeStr);
                Timestamp startTime = new Timestamp(startDate.getTime());

                // Create or update session
                Session newSession = new Session(
                        isEditing ? session.getSessionId() : 0,
                        currentUser.getUserId(),
                        title,
                        description,
                        expertiseTag,
                        startTime,
                        duration,
                        capacity
                );

                boolean success;
                if (isEditing) {
                    success = dbHandler.updateSession(newSession);
                } else {
                    success = dbHandler.createSession(newSession);
                }

                if (success) {
                    sessionDialog.dispose();
                    loadSessions(); // Refresh the table
                } else {
                    statusLabel.setText("Error saving session. Please try again.");
                }
            } catch (ParseException ex) {
                statusLabel.setText("Invalid date or time format. Use yyyy-MM-dd and HH:mm.");
            }
        });

        cancelButton.addActionListener(e -> sessionDialog.dispose());

        buttonPanel.add(statusLabel);
        buttonPanel.add(saveButton);
        buttonPanel.add(cancelButton);

        // Add panels to main panel
        mainPanel.add(formPanel, BorderLayout.CENTER);
        mainPanel.add(buttonPanel, BorderLayout.SOUTH);

        // Set content pane and show dialog
        sessionDialog.setContentPane(mainPanel);
        sessionDialog.setVisible(true);
    }

    /**
     * Delete a session
     *
     * @param sessionId ID of the session to delete
     */
    private void deleteSession(int sessionId) {
        int confirm = JOptionPane.showConfirmDialog(
                this,
                "Are you sure you want to delete this session?",
                "Confirm Deletion",
                JOptionPane.YES_NO_OPTION
        );

        if (confirm == JOptionPane.YES_OPTION) {
            if (dbHandler.deleteSession(sessionId)) {
                loadSessions(); // Refresh the table
            } else {
                JOptionPane.showMessageDialog(
                        this,
                        "Error deleting session. Please try again.",
                        "Error",
                        JOptionPane.ERROR_MESSAGE
                );
            }
        }
    }

    /**
     * Logout and return to login screen
     */
    private void logout() {
        int confirm = JOptionPane.showConfirmDialog(
                this,
                "Are you sure you want to logout?",
                "Confirm Logout",
                JOptionPane.YES_NO_OPTION
        );

        if (confirm == JOptionPane.YES_OPTION) {
            dispose();
            new LoginSystem().createLoginPage();
        }
    }
}