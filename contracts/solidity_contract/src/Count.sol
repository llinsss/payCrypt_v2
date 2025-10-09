// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleCounter {
    uint public count; // Declares a public unsigned integer variable to store the counter value

    // Constructor function, executed only once when the contract is deployed
    constructor() {
        count = 0; // Initializes the counter to zero
    }

    // Function to increment the counter by 1
    function increment() public {
        count++; // Increments the 'count' variable
    }

    // Function to decrement the counter by 1
    function decrement() public {
        require(count > 0, "Counter cannot go below zero"); // Ensures the counter is not decremented below zero
        count--; // Decrements the 'count' variable
    }

    // Function to retrieve the current value of the counter
    function getCount() public view returns (uint) {
        return count; // Returns the current value of 'count'
    }

    // Function to reset the counter to a specific value
    function reset(uint _newValue) public {
        count = _newValue; // Sets the 'count' variable to the provided new value
    }
}

//  --private-key d76a82d3738fb64e1e9e4d21d4a0c086b7e3abfb8fee51c623ec30568dbc9324