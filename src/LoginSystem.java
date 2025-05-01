import javax.swing.*;
import java.awt.*;
import java.awt.event.*;

/**
 * LoginSystem - Main class for the login and registration system
 * Uses DatabaseHandler for all database operations
 */
public class LoginSystem {
    private JFrame loginFrame;
    private JFrame registerFrame;
    private DatabaseHandler dbHandler;

    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            try {
                UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
            } catch (Exception e) {
                e.printStackTrace();
            }
            new LoginSystem().createLoginPage();
        });
    }

    /**
     * Constructor for LoginSystem
     * Initializes the DatabaseHandler
     */
    public LoginSystem() {
        dbHandler = new DatabaseHandler();
    }

    /**
     * Create the login page
     */
    public void createLoginPage() {
        loginFrame = new JFrame("Mentor Matching - Login");
        loginFrame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        loginFrame.setSize(400, 350);
        loginFrame.setLocationRelativeTo(null);

        JPanel mainPanel = new JPanel();
        mainPanel.setLayout(new BorderLayout(10, 10));
        mainPanel.setBorder(BorderFactory.createEmptyBorder(20, 20, 20, 20));

        // Title panel
        JPanel titlePanel = new JPanel();
        JLabel titleLabel = new JLabel("Mentor Matching System");
        titleLabel.setFont(new Font("Arial", Font.BOLD, 20));
        titlePanel.add(titleLabel);

        // Input panel
        JPanel inputPanel = new JPanel();
        inputPanel.setLayout(new GridLayout(3, 1, 10, 10));

        JPanel emailPanel = new JPanel(new BorderLayout(5, 5));
        JLabel emailLabel = new JLabel("Email:");
        JTextField emailField = new JTextField(20);
        emailPanel.add(emailLabel, BorderLayout.WEST);
        emailPanel.add(emailField, BorderLayout.CENTER);

        JPanel passwordPanel = new JPanel(new BorderLayout(5, 5));
        JLabel passwordLabel = new JLabel("Password:");
        JPasswordField passwordField = new JPasswordField(20);
        passwordPanel.add(passwordLabel, BorderLayout.WEST);
        passwordPanel.add(passwordField, BorderLayout.CENTER);

        JPanel buttonPanel = new JPanel(new FlowLayout(FlowLayout.CENTER, 10, 0));
        JButton loginButton = new JButton("Login");
        JButton registerButton = new JButton("Register");
        buttonPanel.add(loginButton);
        buttonPanel.add(registerButton);

        inputPanel.add(emailPanel);
        inputPanel.add(passwordPanel);
        inputPanel.add(buttonPanel);

        // Status panel for messages
        JPanel statusPanel = new JPanel(new BorderLayout());
        JLabel statusLabel = new JLabel(" ");
        statusLabel.setHorizontalAlignment(SwingConstants.CENTER);
        statusPanel.add(statusLabel, BorderLayout.CENTER);

        // Add panels to main panel
        mainPanel.add(titlePanel, BorderLayout.NORTH);
        mainPanel.add(inputPanel, BorderLayout.CENTER);
        mainPanel.add(statusPanel, BorderLayout.SOUTH);

        // Add action listeners
        loginButton.addActionListener(e -> {
            String email = emailField.getText();
            String password = new String(passwordField.getPassword());

            if (email.isEmpty() || password.isEmpty()) {
                statusLabel.setText("Please enter both email and password");
                statusLabel.setForeground(Color.RED);
                return;
            }

            // Attempt to login using DatabaseHandler
            int userId = dbHandler.authenticateUser(email, password);
            if (userId != -1) {
                statusLabel.setText("Login successful!");
                statusLabel.setForeground(new Color(0, 150, 0));

                // You could launch the main application here, passing the userId
                // Launch appropriate dashboard based on user role
                User user = dbHandler.getUserById(userId);
                if (user != null) {
                    if (user.isMentor()) {
                        new MentorDashboard(user).setVisible(true);
                    } else {
                        // For now, just show a message
                        //JOptionPane.showMessageDialog(loginFrame, "Student dashboard is not implemented yet.");
                        // Once implemented: new StudentDashboard(user).setVisible(true);
                        new StudentDashbaord(user).setVisible(true);
                    }

                    loginFrame.dispose();
                } else {
                    statusLabel.setText("Error retrieving user information");
                    statusLabel.setForeground(Color.RED);
                }

                // Clear the fields
                emailField.setText("");
                passwordField.setText("");
            } else {
                statusLabel.setText("Invalid email or password");
                statusLabel.setForeground(Color.RED);
            }
        });

        registerButton.addActionListener(e -> {
            // Hide login window and show registration window
            loginFrame.setVisible(false);
            createRegistrationPage();
        });

        loginFrame.add(mainPanel);
        loginFrame.setVisible(true);
    }

    /**
     * Create the registration page
     */
    private void createRegistrationPage() {
        registerFrame = new JFrame("Mentor Matching - Registration");
        registerFrame.setSize(500, 500);
        registerFrame.setLocationRelativeTo(null);
        registerFrame.setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);

        JPanel mainPanel = new JPanel();
        mainPanel.setLayout(new BorderLayout(10, 10));
        mainPanel.setBorder(BorderFactory.createEmptyBorder(20, 20, 20, 20));

        // Title panel
        JPanel titlePanel = new JPanel();
        JLabel titleLabel = new JLabel("Register New Account");
        titleLabel.setFont(new Font("Arial", Font.BOLD, 20));
        titlePanel.add(titleLabel);

        // Form panel
        JPanel formPanel = new JPanel();
        formPanel.setLayout(new GridLayout(6, 1, 10, 10));

        JPanel namePanel = new JPanel(new BorderLayout(5, 5));
        JLabel nameLabel = new JLabel("Name:");
        JTextField nameField = new JTextField(20);
        namePanel.add(nameLabel, BorderLayout.WEST);
        namePanel.add(nameField, BorderLayout.CENTER);

        JPanel emailPanel = new JPanel(new BorderLayout(5, 5));
        JLabel emailLabel = new JLabel("Email:");
        JTextField emailField = new JTextField(20);
        emailPanel.add(emailLabel, BorderLayout.WEST);
        emailPanel.add(emailField, BorderLayout.CENTER);

        JPanel passwordPanel = new JPanel(new BorderLayout(5, 5));
        JLabel passwordLabel = new JLabel("Password:");
        JPasswordField passwordField = new JPasswordField(20);
        passwordPanel.add(passwordLabel, BorderLayout.WEST);
        passwordPanel.add(passwordField, BorderLayout.CENTER);

        JPanel confirmPanel = new JPanel(new BorderLayout(5, 5));
        JLabel confirmLabel = new JLabel("Confirm Password:");
        JPasswordField confirmField = new JPasswordField(20);
        confirmPanel.add(confirmLabel, BorderLayout.WEST);
        confirmPanel.add(confirmField, BorderLayout.CENTER);

        JPanel rolePanel = new JPanel(new BorderLayout(5, 5));
        JLabel roleLabel = new JLabel("Role:");
        String[] roles = {"student", "mentor"};
        JComboBox<String> roleComboBox = new JComboBox<>(roles);
        rolePanel.add(roleLabel, BorderLayout.WEST);
        rolePanel.add(roleComboBox, BorderLayout.CENTER);

        JPanel expertisePanel = new JPanel(new BorderLayout(5, 5));
        JLabel expertiseLabel = new JLabel("Expertise:");
        JTextField expertiseField = new JTextField(20);
        // Initially disable expertise field as default selection is "student"
        expertiseField.setEnabled(false);
        expertiseField.setBackground(Color.LIGHT_GRAY);
        expertisePanel.add(expertiseLabel, BorderLayout.WEST);
        expertisePanel.add(expertiseField, BorderLayout.CENTER);

        // Add item listener to roleComboBox to toggle expertise field
        roleComboBox.addItemListener(e -> {
            if (e.getStateChange() == ItemEvent.SELECTED) {
                String selectedRole = (String) roleComboBox.getSelectedItem();
                boolean isMentor = "mentor".equals(selectedRole);

                // Enable/disable expertise field based on role selection
                expertiseField.setEnabled(isMentor);
                expertiseField.setBackground(isMentor ? Color.WHITE : Color.LIGHT_GRAY);

                // Clear expertise field when switching to student
                if (!isMentor) {
                    expertiseField.setText("");
                }
            }
        });

        formPanel.add(namePanel);
        formPanel.add(emailPanel);
        formPanel.add(passwordPanel);
        formPanel.add(confirmPanel);
        formPanel.add(rolePanel);
        formPanel.add(expertisePanel);

        // Button panel
        JPanel buttonPanel = new JPanel(new FlowLayout(FlowLayout.CENTER, 10, 10));
        JButton submitButton = new JButton("Submit");
        JButton cancelButton = new JButton("Cancel");
        buttonPanel.add(submitButton);
        buttonPanel.add(cancelButton);

        // Status panel
        JPanel statusPanel = new JPanel(new BorderLayout());
        JLabel statusLabel = new JLabel(" ");
        statusLabel.setHorizontalAlignment(SwingConstants.CENTER);
        statusPanel.add(statusLabel, BorderLayout.CENTER);

        // Add panels to main panel
        mainPanel.add(titlePanel, BorderLayout.NORTH);
        mainPanel.add(formPanel, BorderLayout.CENTER);

        // Create a south panel to hold both button panel and status panel
        JPanel southPanel = new JPanel(new BorderLayout(10, 10));
        southPanel.add(buttonPanel, BorderLayout.CENTER);
        southPanel.add(statusPanel, BorderLayout.SOUTH);

        // Add south panel to main panel
        mainPanel.add(southPanel, BorderLayout.SOUTH);

        // Add action listeners
        submitButton.addActionListener(e -> {
            String name = nameField.getText();
            String email = emailField.getText();
            String password = new String(passwordField.getPassword());
            String confirmPassword = new String(confirmField.getPassword());
            String role = (String) roleComboBox.getSelectedItem();
            String expertise = expertiseField.getText();

            // Validate input
            if (name.isEmpty() || email.isEmpty() || password.isEmpty()) {
                statusLabel.setText("Please fill in all required fields");
                statusLabel.setForeground(Color.RED);
                return;
            }

            // Validate expertise only for mentors
            String selectedRole = (String) roleComboBox.getSelectedItem();
            boolean isMentor = "mentor".equals(selectedRole);
            if (isMentor && expertise.isEmpty()) {
                statusLabel.setText("Mentors must specify their expertise");
                statusLabel.setForeground(Color.RED);
                return;
            }

            if (!password.equals(confirmPassword)) {
                statusLabel.setText("Passwords do not match");
                statusLabel.setForeground(Color.RED);
                return;
            }

            // Check if email already exists
            if (dbHandler.isEmailExists(email)) {
                statusLabel.setText("Email already registered");
                statusLabel.setForeground(Color.RED);
                return;
            }

            // Set expertise to null for students
            String expertiseValue = "mentor".equals(role) ? expertise : null;

            // Register the user using DatabaseHandler
            if (dbHandler.registerUser(name, email, password, role, expertiseValue)) {
                statusLabel.setText("Registration successful!");
                statusLabel.setForeground(new Color(0, 150, 0));

                // Clear the fields
                nameField.setText("");
                emailField.setText("");
                passwordField.setText("");
                confirmField.setText("");
                expertiseField.setText("");

                // Close registration window and show login window after a short delay
                Timer timer = new Timer(1500, event -> {
                    registerFrame.dispose();
                    loginFrame.setVisible(true);
                });
                timer.setRepeats(false);
                timer.start();
            } else {
                statusLabel.setText("Registration failed. Please try again later.");
                statusLabel.setForeground(Color.RED);
            }
        });

        cancelButton.addActionListener(e -> {
            registerFrame.dispose();
            loginFrame.setVisible(true);
        });

        // Handle window closing
        registerFrame.addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosing(WindowEvent e) {
                loginFrame.setVisible(true);
            }
        });

        registerFrame.add(mainPanel);
        registerFrame.setVisible(true);
    }
}