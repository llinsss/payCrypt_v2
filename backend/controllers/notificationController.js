import Notification from "../models/Notification.js";

export const getNotificationByUserId = async (req, res) => {
  try {
    const { id } = req.user;
    const notification = await Notification.getByUser(id);
    if (!notification) {
      return res.status(200).json([]);
    }
    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getUnreadNotificationByUserId = async (req, res) => {
  try {
    const { id } = req.user;
    const notification = await Notification.getUnreadByUser(id);
    if (!notification) {
      return res.status(200).json([]);
    }
    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(400).json({ error: "Notification not found" });
    }

    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(400).json({ error: "Notification not found" });
    }

    // Only allow notification owner to update
    if (notification.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const updatedNotification = await Notification.update(id, { read: true });
    res.json(updatedNotification);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(400).json({ error: "Notification not found" });
    }

    // Only allow notification owner to delete
    if (notification.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await Notification.delete(id);
    res.json({ message: "Notification deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
