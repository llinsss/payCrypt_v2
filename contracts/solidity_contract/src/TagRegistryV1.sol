// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {UUPSUpgradeable} from "lib/openzeppelin-contracts-upgradeable/contracts/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "lib/openzeppelin-contracts-upgradeable/contracts/access/OwnableUpgradeable.sol";
import {Initializable} from "lib/openzeppelin-contracts-upgradeable/contracts/proxy/utils/Initializable.sol";

contract TagRegistryV1 is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    struct TagProfile {
        address owner;
        address chainAddress;
        bool exists;
    }

    mapping(string => TagProfile) private tags;
    mapping(string => bool) private tagTaken;
    string[] private registeredTags;

    event TagRegistered(string indexed tag, address indexed owner, address indexed chainAddress);
    event TagTransferred(string indexed tag, address indexed from, address indexed to);
    event TagResolved(string indexed tag, address indexed chainAddress);

    function initialize() public initializer {
        __Ownable_init(msg.sender);
    }

    modifier onlyTagOwner(string memory tag) {
        require(tags[tag].owner == msg.sender, "Not tag owner");
        _;
    }

    function registerTag(
        string memory tag,
        address chainAddress
    ) external returns (bool) {
        require(bytes(tag).length > 0, "Tag cannot be empty");
        require(bytes(tag).length <= 32, "Tag too long");
        require(!tagTaken[tag], "Tag already taken");
        require(chainAddress != address(0), "Invalid chain address");

        tags[tag] = TagProfile(msg.sender, chainAddress, true);
        tagTaken[tag] = true;
        registeredTags.push(tag);

        emit TagRegistered(tag, msg.sender, chainAddress);
        return true;
    }

    function resolveTag(string memory tag) external view returns (address) {
        require(tags[tag].exists, "Tag not registered");
        return tags[tag].chainAddress;
    }

    function getTagProfile(string memory tag) external view returns (TagProfile memory) {
        require(tags[tag].exists, "Tag not registered");
        return tags[tag];
    }

    function isTagTaken(string memory tag) external view returns (bool) {
        return tagTaken[tag];
    }

    function transferTag(
        string memory tag,
        address newOwner
    ) external onlyTagOwner(tag) returns (bool) {
        require(newOwner != address(0), "Invalid new owner");
        require(newOwner != tags[tag].owner, "Same owner");

        address oldOwner = tags[tag].owner;
        tags[tag].owner = newOwner;

        emit TagTransferred(tag, oldOwner, newOwner);
        return true;
    }

    function updateChainAddress(
        string memory tag,
        address newChainAddress
    ) external onlyTagOwner(tag) returns (bool) {
        require(newChainAddress != address(0), "Invalid chain address");

        tags[tag].chainAddress = newChainAddress;
        emit TagResolved(tag, newChainAddress);
        return true;
    }

    function getRegisteredTagsCount() external view returns (uint256) {
        return registeredTags.length;
    }

    function getRegisteredTagAt(uint256 index) external view returns (string memory) {
        require(index < registeredTags.length, "Index out of bounds");
        return registeredTags[index];
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
