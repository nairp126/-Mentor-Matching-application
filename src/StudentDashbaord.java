import javax.swing.*;
import javax.swing.border.*;
import javax.swing.table.*;
import java.awt.*;
import java.awt.event.*;
import java.util.Vector;
import java.sql.Timestamp;
import java.text.SimpleDateFormat;

/**
 * StudentDashboard - Dashboard for students to view and register for mentoring sessions
 * Uses DatabaseHandler for all database operations
 */
public class StudentDashbaord extends JFrame {
    private User currentUser;
    private DatabaseHandler dbHandler;
    private JTabbedPane tabbedPane;
    private JTable availableSessionsTable;
    private JTable registeredSessionsTable;
    private JTable mentorsTable;
    private DefaultTableModel availableSessionsModel;
    private DefaultTableModel registeredSessionsModel;
    private DefaultTableModel mentorListModel;
    private JComboBox<String> expertiseFilter;
    private JLabel statusLabel;

    private final SimpleDateFormat dateFormat = new SimpleDateFormat("MMM dd, yyyy HH:mm");

    /**
     * Constructor for StudentDashboard
     * @param user The logged-in student user
     */
    public StudentDashbaord(User user) {
        this.currentUser = user;
        this.dbHandler = new DatabaseHandler();
        initializeUI();
        loadData();
    }

    /**
     * Initialize the user interface
     */
    private void initializeUI() {
        setTitle("Student Dashboard - Mentor Matching System");
        setSize(900, 600);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setLocationRelativeTo(null);

        // Create components
        JPanel mainPanel = new JPanel(new BorderLayout(10, 10));
        mainPanel.setBorder(BorderFactory.createEmptyBorder(15, 15, 15, 15));

        // Welcome panel
        JPanel welcomePanel = createWelcomePanel();

        // Create tabbed pane
        tabbedPane = new JTabbedPane();

        // Available Sessions Tab
        JPanel availableSessionsPanel = createAvailableSessionsPanel();
        tabbedPane.addTab("Available Sessions", availableSessionsPanel);

        // Registered Sessions Tab
        JPanel registeredSessionsPanel = createRegisteredSessionsPanel();
        tabbedPane.addTab("My Sessions", registeredSessionsPanel);

        // Mentors Tab
        JPanel mentorsPanel = createMentorPanel();
        tabbedPane.addTab("Mentors", mentorsPanel);

        // Profile Tab
        JPanel profilePanel = createProfilePanel();
        tabbedPane.addTab("My Profile", profilePanel);

        // Status Panel
        JPanel statusPanel = new JPanel(new BorderLayout());
        statusLabel = new JLabel(" ");
        statusLabel.setHorizontalAlignment(SwingConstants.CENTER);
        statusPanel.add(statusLabel, BorderLayout.CENTER);

        // Add components to main panel
        mainPanel.add(welcomePanel, BorderLayout.NORTH);
        mainPanel.add(tabbedPane, BorderLayout.CENTER);
        mainPanel.add(statusPanel, BorderLayout.SOUTH);

        add(mainPanel);
    }

    /**
     * Create the welcome panel with user information
     * @return The welcome panel
     */
    private JPanel createWelcomePanel() {
        JPanel panel = new JPanel(new BorderLayout(10, 0));
        panel.setBorder(BorderFactory.createCompoundBorder(
                BorderFactory.createMatteBorder(0, 0, 1, 0, Color.GRAY),
                BorderFactory.createEmptyBorder(0, 0, 10, 0)
        ));

        JLabel welcomeLabel = new JLabel("Welcome, " + currentUser.getName() + "!");
        welcomeLabel.setFont(new Font("Arial", Font.BOLD, 18));

        JLabel roleLabel = new JLabel("Student Dashboard");
        roleLabel.setFont(new Font("Arial", Font.ITALIC, 14));

        JPanel leftPanel = new JPanel(new GridLayout(2, 1));
        leftPanel.setOpaque(false);
        leftPanel.add(welcomeLabel);
        leftPanel.add(roleLabel);

        JButton logoutButton = new JButton("Logout");
        logoutButton.addActionListener(e -> logout());

        panel.add(leftPanel, BorderLayout.WEST);
        panel.add(logoutButton, BorderLayout.EAST);

        return panel;
    }

    /**
     * Create the available sessions panel
     * @return The available sessions panel
     */
    private JPanel createAvailableSessionsPanel() {
        JPanel panel = new JPanel(new BorderLayout(10, 10));
        panel.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

        // Filter Panel
        JPanel filterPanel = new JPanel(new FlowLayout(FlowLayout.LEFT));
        JLabel filterLabel = new JLabel("Filter by expertise: ");
        expertiseFilter = new JComboBox<>();
        expertiseFilter.addItem("All");
        JButton applyFilterButton = new JButton("Apply Filter");
        JButton refreshButton = new JButton("Refresh");

        filterPanel.add(filterLabel);
        filterPanel.add(expertiseFilter);
        filterPanel.add(applyFilterButton);
        filterPanel.add(refreshButton);

        // Table for available sessions
        String[] columnNames = {"Session ID", "Title", "Description", "Expertise", "Mentor", "Date & Time", "Duration (min)", "Capacity", "Actions"};
        availableSessionsModel = new DefaultTableModel(columnNames, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return column == 8; // Only actions column is editable
            }
        };

        availableSessionsTable = new JTable(availableSessionsModel);
        configureTable(availableSessionsTable);

        // Button column
        TableColumn actionColumn = availableSessionsTable.getColumnModel().getColumn(8);
        actionColumn.setCellRenderer(new ButtonRenderer());
        actionColumn.setCellEditor(new ButtonEditor(new JCheckBox(), "Register"));

        JScrollPane scrollPane = new JScrollPane(availableSessionsTable);
        scrollPane.setBorder(BorderFactory.createEmptyBorder());

        // Add action listeners
        applyFilterButton.addActionListener(e -> {
            String selectedExpertise = (String) expertiseFilter.getSelectedItem();
            loadAvailableSessions(selectedExpertise);
        });

        refreshButton.addActionListener(e -> {
            expertiseFilter.setSelectedItem("All");
            loadAvailableSessions("All");
        });

        panel.add(filterPanel, BorderLayout.NORTH);
        panel.add(scrollPane, BorderLayout.CENTER);

        return panel;
    }

    /**
     * Create the registered sessions panel
     * @return The registered sessions panel
     */
    private JPanel createRegisteredSessionsPanel() {
        JPanel panel = new JPanel(new BorderLayout(10, 10));
        panel.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

        JPanel headerPanel = new JPanel(new BorderLayout());
        JLabel titleLabel = new JLabel("My Registered Sessions");
        titleLabel.setFont(new Font("Arial", Font.BOLD, 14));

        JButton refreshButton = new JButton("Refresh");
        refreshButton.addActionListener(e -> loadRegisteredSessions());

        headerPanel.add(titleLabel, BorderLayout.WEST);
        headerPanel.add(refreshButton, BorderLayout.EAST);

        // Table for registered sessions
        String[] columnNames = {"Session ID", "Title", "Expertise", "Mentor", "Date & Time", "Duration (min)", "Actions"};
        registeredSessionsModel = new DefaultTableModel(columnNames, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return column == 6; // Only actions column is editable
            }
        };

        registeredSessionsTable = new JTable(registeredSessionsModel);
        configureTable(registeredSessionsTable);

        // Button column
        TableColumn actionColumn = registeredSessionsTable.getColumnModel().getColumn(6);
        actionColumn.setCellRenderer(new ButtonRenderer());
        actionColumn.setCellEditor(new ButtonEditor(new JCheckBox(), "Cancel"));

        JScrollPane scrollPane = new JScrollPane(registeredSessionsTable);
        scrollPane.setBorder(BorderFactory.createEmptyBorder());

        panel.add(headerPanel, BorderLayout.NORTH);
        panel.add(scrollPane, BorderLayout.CENTER);

        return panel;
    }

    /**
     * Create the profile panel
     * @return The profile panel
     */
    private JPanel createProfilePanel() {
        JPanel panel = new JPanel(new BorderLayout(10, 10));
        panel.setBorder(BorderFactory.createEmptyBorder(20, 20, 20, 20));

        JPanel formPanel = new JPanel(new GridLayout(4, 1, 10, 15));
        formPanel.setBorder(BorderFactory.createEmptyBorder(0, 100, 0, 100));

        // Name field
        JPanel namePanel = new JPanel(new BorderLayout(10, 0));
        JLabel nameLabel = new JLabel("Name:");
        JTextField nameField = new JTextField(currentUser.getName());
        namePanel.add(nameLabel, BorderLayout.WEST);
        namePanel.add(nameField, BorderLayout.CENTER);

        // Email field
        JPanel emailPanel = new JPanel(new BorderLayout(10, 0));
        JLabel emailLabel = new JLabel("Email:");
        JTextField emailField = new JTextField(currentUser.getEmail());
        emailPanel.add(emailLabel, BorderLayout.WEST);
        emailPanel.add(emailField, BorderLayout.CENTER);

        // Password field
        JPanel passwordPanel = new JPanel(new BorderLayout(10, 0));
        JLabel passwordLabel = new JLabel("New Password:");
        JPasswordField passwordField = new JPasswordField();
        passwordPanel.add(passwordLabel, BorderLayout.WEST);
        passwordPanel.add(passwordField, BorderLayout.CENTER);

        // Update button
        JButton updateButton = new JButton("Update Profile");
        updateButton.addActionListener(e -> {
            String name = nameField.getText();
            String email = emailField.getText();
            String password = new String(passwordField.getPassword());

            if (name.isEmpty() || email.isEmpty()) {
                JOptionPane.showMessageDialog(this, "Name and email cannot be empty", "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            if (dbHandler.updateUserProfile(currentUser.getUserId(), name, email, password)) {
                // Update the current user object
                currentUser.setName(name);
                currentUser.setEmail(email);

                JOptionPane.showMessageDialog(this, "Profile updated successfully", "Success", JOptionPane.INFORMATION_MESSAGE);
                passwordField.setText("");
            } else {
                JOptionPane.showMessageDialog(this, "Failed to update profile", "Error", JOptionPane.ERROR_MESSAGE);
            }
        });

        formPanel.add(namePanel);
        formPanel.add(emailPanel);
        formPanel.add(passwordPanel);
        formPanel.add(updateButton);

        JPanel titlePanel = new JPanel();
        JLabel titleLabel = new JLabel("Edit Your Profile");
        titleLabel.setFont(new Font("Arial", Font.BOLD, 16));
        titlePanel.add(titleLabel);

        panel.add(titlePanel, BorderLayout.NORTH);
        panel.add(formPanel, BorderLayout.CENTER);

        return panel;
    }

    /**
     * Configure table appearance and behavior
     * @param table The table to configure
     */
    private void configureTable(JTable table) {
        table.setRowHeight(30);
        table.setIntercellSpacing(new Dimension(10, 0));
        table.setShowGrid(false);
        table.setShowVerticalLines(true);
        table.getTableHeader().setReorderingAllowed(false);

        // Center align headers
        ((DefaultTableCellRenderer) table.getTableHeader().getDefaultRenderer())
                .setHorizontalAlignment(JLabel.CENTER);

        // Center align cells (except description)
        DefaultTableCellRenderer centerRenderer = new DefaultTableCellRenderer();
        centerRenderer.setHorizontalAlignment(JLabel.CENTER);

        for (int i = 0; i < table.getColumnCount(); i++) {
            if (i != 2) { // Skip description column
                table.getColumnModel().getColumn(i).setCellRenderer(centerRenderer);
            }
        }
    }

    /**
     * Load initial data for the dashboard
     */
    private void loadData() {
        // Load expertise filters
        String[] expertiseTags = dbHandler.getAllExpertiseTags();
        expertiseFilter.addItem("All");
        for (String tag : expertiseTags) {
            expertiseFilter.addItem(tag);
        }

        // Load sessions
        loadAvailableSessions("All");
        loadRegisteredSessions();
    }

    /**
     * Load available sessions
     * @param expertiseFilter Filter by expertise (or "All")
     */
    private void loadAvailableSessions(String expertiseFilter) {
        // Clear the model
        availableSessionsModel.setRowCount(0);

        // Get sessions based on filter
        Session[] sessions;
        if ("All".equals(expertiseFilter)) {
            sessions = dbHandler.getAllAvailableSessions();
        } else {
            sessions = dbHandler.getSessionsByExpertise(expertiseFilter);
        }

        // Add sessions to table
        for (Session session : sessions) {
            String mentorName = dbHandler.getMentorNameById(session.getMentorId());
            String formattedDate = dateFormat.format(session.getStartTime());

            Vector<Object> row = new Vector<>();
            row.add(session.getSessionId());
            row.add(session.getTitle());
            row.add(session.getDescription());
            row.add(session.getExpertiseTag());
            row.add(mentorName);
            row.add(formattedDate);
            row.add(session.getDuration());
            row.add(session.getCapacity());
            row.add("Register");

            availableSessionsModel.addRow(row);
        }

        statusLabel.setText("Found " + sessions.length + " available sessions");
    }

    /**
     * Load registered sessions for current user
     */
    private void loadRegisteredSessions() {
        // Clear the model
        registeredSessionsModel.setRowCount(0);

        // Get registered sessions
        Session[] sessions = dbHandler.getRegisteredSessions(currentUser.getUserId());

        // Add sessions to table
        for (Session session : sessions) {
            String mentorName = dbHandler.getMentorNameById(session.getMentorId());
            String formattedDate = dateFormat.format(session.getStartTime());

            Vector<Object> row = new Vector<>();
            row.add(session.getSessionId());
            row.add(session.getTitle());
            row.add(session.getExpertiseTag());
            row.add(mentorName);
            row.add(formattedDate);
            row.add(session.getDuration());
            row.add("Cancel");

            registeredSessionsModel.addRow(row);
        }

        statusLabel.setText("You are registered for " + sessions.length + " sessions");
    }

    /**
     * Handle logout
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

    /**
     * Custom button renderer for table cells
     */
    private class ButtonRenderer extends JButton implements TableCellRenderer {
        public ButtonRenderer() {
            setOpaque(true);
            setBorderPainted(false);
        }

        @Override
        public Component getTableCellRendererComponent(JTable table, Object value, boolean isSelected, boolean hasFocus, int row, int column) {
            setText((value == null) ? "" : value.toString());

            if (value != null && value.toString().equals("Register")) {
                setBackground(new Color(0, 120, 215));
                setForeground(Color.WHITE);
            } else if (value != null && value.toString().equals("Cancel")) {
                setBackground(new Color(220, 53, 69));
                setForeground(Color.WHITE);
            }

            return this;
        }
    }

    /**
     * Custom button editor for table cells
     */
    private class ButtonEditor extends DefaultCellEditor {
        private JButton button;
        private String label;
        private boolean isPushed;
        private int row, column;
        private JTable table;

        public ButtonEditor(JCheckBox checkBox, String label) {
            super(checkBox);
            this.label = label;
            button = new JButton();
            button.setOpaque(true);
            button.setBorderPainted(false);

            if ("Register".equals(label)) {
                button.setBackground(new Color(0, 120, 215));
                button.setForeground(Color.WHITE);
            } else if ("Cancel".equals(label)) {
                button.setBackground(new Color(220, 53, 69));
                button.setForeground(Color.WHITE);
            }

            button.addActionListener(e -> fireEditingStopped());
        }

        @Override
        public Component getTableCellEditorComponent(JTable table, Object value, boolean isSelected, int row, int column) {
            this.table = table;
            this.row = row;
            this.column = column;

            label = (value == null) ? "" : value.toString();
            button.setText(label);
            isPushed = true;
            return button;
        }

        @Override
        public Object getCellEditorValue() {
            if (isPushed) {
                if (table == availableSessionsTable) {
                    int sessionId = (int) availableSessionsTable.getValueAt(row, 0);
                    registerForSession(sessionId);
                } else if (table == registeredSessionsTable) {
                    int sessionId = (int) registeredSessionsTable.getValueAt(row, 0);
                    cancelRegistration(sessionId);
                }
            }
            isPushed = false;
            return label;
        }

        @Override
        public boolean stopCellEditing() {
            isPushed = false;
            return super.stopCellEditing();
        }
    }

    /**
     * Register for a session
     * @param sessionId ID of the session to register for
     */
    private void registerForSession(int sessionId) {
        if (dbHandler.registerForSession(sessionId, currentUser.getUserId())) {
            JOptionPane.showMessageDialog(
                    this,
                    "Successfully registered for the session!",
                    "Registration Successful",
                    JOptionPane.INFORMATION_MESSAGE
            );

            // Refresh both tables
            loadAvailableSessions((String) expertiseFilter.getSelectedItem());
            loadRegisteredSessions();

            // Switch to registered sessions tab
            tabbedPane.setSelectedIndex(1);
        } else {
            JOptionPane.showMessageDialog(
                    this,
                    "Failed to register for the session. It may be full or you're already registered.",
                    "Registration Failed",
                    JOptionPane.ERROR_MESSAGE
            );
        }
    }

    /**
     * Cancel registration for a session
     * @param sessionId ID of the session to cancel registration for
     */
    private void cancelRegistration(int sessionId) {
        int confirm = JOptionPane.showConfirmDialog(
                this,
                "Are you sure you want to cancel your registration for this session?",
                "Confirm Cancellation",
                JOptionPane.YES_NO_OPTION
        );

        if (confirm == JOptionPane.YES_OPTION) {
            if (dbHandler.cancelRegistration(sessionId, currentUser.getUserId())) {
                JOptionPane.showMessageDialog(
                        this,
                        "Registration canceled successfully",
                        "Cancellation Successful",
                        JOptionPane.INFORMATION_MESSAGE
                );

                // Refresh both tables
                loadAvailableSessions((String) expertiseFilter.getSelectedItem());
                loadRegisteredSessions();
            } else {
                JOptionPane.showMessageDialog(
                        this,
                        "Failed to cancel registration",
                        "Cancellation Failed",
                        JOptionPane.ERROR_MESSAGE
                );
            }
        }
    }




    /**
     * Load all mentors data into the mentors table
     */
    private void loadMentors() {
        User[] mentor = dbHandler.getAllMentors();

        // Add sessions to table
        for (User mentee : mentor) {


            Vector<Object> row = new Vector<>();
            row.add(mentee.getUserId());
            row.add(mentee.getName());
            row.add(mentee.getExpertise());
            row.add(mentee.getEmail());


            mentorListModel.addRow(row);
        }

        statusLabel.setText("You can choose among " + mentor.length + " mentors");
    }

    private JPanel createMentorPanel() {
        JPanel panel = new JPanel(new BorderLayout(10, 10));
        panel.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

        JPanel headerPanel = new JPanel(new BorderLayout());
        JLabel titleLabel = new JLabel("Mentors");
        titleLabel.setFont(new Font("Arial", Font.BOLD, 14));

        JButton refreshButton = new JButton("Refresh");
        refreshButton.addActionListener(e -> loadMentors());

        headerPanel.add(titleLabel, BorderLayout.WEST);
        headerPanel.add(refreshButton, BorderLayout.EAST);

        // Table for registered sessions
        String[] columnNames = {"Mentor ID", "Name", "Expertise", "Email"};
        mentorListModel = new DefaultTableModel(columnNames, 0) {

        };

        mentorsTable = new JTable(mentorListModel);
        configureTable(mentorsTable);



        JScrollPane scrollPane = new JScrollPane(mentorsTable);
        scrollPane.setBorder(BorderFactory.createEmptyBorder());

        panel.add(headerPanel, BorderLayout.NORTH);
        panel.add(scrollPane, BorderLayout.CENTER);

        return panel;
    }
}