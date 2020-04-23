USE CSProjectSystem;

DELIMITER $$

-- Before each insert of a Team entity
DROP TRIGGER IF EXISTS Before_Team_Insert$$
CREATE TRIGGER Before_Team_Insert BEFORE INSERT ON Team FOR EACH ROW
BEGIN
  IF NOT ISNULL(NEW.leader) THEN
    SIGNAL SQLSTATE '45000' SET message_text = "New leader should be in team";
  END IF;
END$$

-- Before each update to a Team entity
DROP TRIGGER IF EXISTS Before_Team_Update$$
CREATE TRIGGER Before_Team_Update BEFORE UPDATE ON Team FOR EACH ROW
BEGIN
  DECLARE leaderMemberOf INT;
  DECLARE memberCnt INT;

  -- Check that the new leader is part of the team
  IF NOT ISNULL(NEW.leader) THEN
    SELECT memberOf INTO leaderMemberOf FROM Student WHERE suid = NEW.leader;
    IF leaderMemberOf != NEW.tid OR ISNULL(leaderMemberOf) THEN
      SIGNAL SQLSTATE '45000' SET message_text = "New leader should be in team";
    END IF;
  END IF;

  -- Check that the new size limit does not go under total number of members
  IF OLD.membLimit <> NEW.membLimit THEN
    SELECT COUNT(*) INTO memberCnt FROM Student WHERE memberOf = OLD.tid;
    IF memberCnt > NEW.membLimit THEN
      SET @msg = CONCAT("New team limit (", NEW.membLimit, ") exceeds number ",
        "of current students (", memberCnt, ")");
      SIGNAL SQLSTATE '45000' SET message_text = @msg;
    END IF;
  END IF;
END$$

-- Before each insert of a Student entity
DROP TRIGGER IF EXISTS Before_Student_Insert$$
CREATE TRIGGER Before_Student_Insert BEFORE INSERT ON Student FOR EACH ROW
BEGIN
  -- Silently null out the memberOf member
  SET NEW.memberOf = NULL;
END$$

-- Before each update of a Student entity
DROP TRIGGER IF EXISTS Before_Student_Update$$
CREATE TRIGGER Before_Student_Update BEFORE UPDATE ON Student FOR EACH ROW
BEGIN
  DECLARE memberCnt INT;
  DECLARE memberLim INT;

  -- When the memberOf property changed...
  IF NOT(NEW.memberOf <=> OLD.memberOf) THEN
    -- First check whether if the team limit exceeded for the team the student
    SELECT COUNT(*) INTO memberCnt FROM Student WHERE memberOf = NEW.memberOf;
    SELECT membLimit INTO memberLim FROM Team WHERE tid = NEW.memberOf;
    IF memberCnt >= memberLim THEN
      SET @msg = CONCAT("This team is already at the max limit of ", memberLim,
        "students");
      SIGNAL SQLSTATE '45000' SET message_text = @msg;
    END IF;

    -- When a student leaves a team, quietly remove the leader if he's leader.
    -- This only happens if an admin makes some changes
    IF NOT ISNULL(OLD.memberOf) THEN
      UPDATE Team SET leader = NULL
      WHERE tid = OLD.memberOf AND leader = OLD.suid;
    END IF;
  END IF;
END$$

-- After deletion of faculty entity
DROP TRIGGER IF EXISTS After_Faculty_Delete$$
CREATE TRIGGER After_Faculty_Delete AFTER DELETE ON Faculty FOR EACH ROW
BEGIN
  -- Delete the FacultyOrTeam entry
  DELETE FROM FacultyOrTeam WHERE teamID = old.tid;
END$$

DELIMITER ;
